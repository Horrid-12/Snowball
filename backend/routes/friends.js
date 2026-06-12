import express from 'express';
import { supabase } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireUUID } from '../middleware/validate.js';

const router = express.Router();

router.use(requireAuth);

const USER_FIELDS = 'id, username, email, profile_icon, created_at';
const FRIENDSHIP_FIELDS = 'id, requester_id, addressee_id, status, created_at, updated_at';
const PRESENCE_FIELDS = 'user_id, details, state, activity_type, remaining_tasks, today_remaining_tasks, score, updated_at';
const MESSAGE_FIELDS = 'id, friendship_id, sender_id, body, created_at';

const publicUser = (user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    profile_icon: user.profile_icon || 'snowball',
    created_at: user.created_at
});

const uniqById = (users = []) => {
    const seen = new Set();
    return users.filter((user) => {
        if (!user?.id || seen.has(user.id)) return false;
        seen.add(user.id);
        return true;
    });
};

const fetchUsersByIds = async (userIds = []) => {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (ids.length === 0) return new Map();

    const { data, error } = await supabase
        .from('users')
        .select(USER_FIELDS)
        .in('id', ids);

    if (error) throw error;
    return new Map((data || []).map((user) => [user.id, publicUser(user)]));
};

const fetchPresenceByUserIds = async (userIds = []) => {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (ids.length === 0) return new Map();

    const { data, error } = await supabase
        .from('friend_presence')
        .select(PRESENCE_FIELDS)
        .in('user_id', ids);

    if (error) throw error;
    return new Map((data || []).map((presence) => [presence.user_id, {
        ...presence,
        is_online: Date.now() - new Date(presence.updated_at).getTime() < 5 * 60 * 1000
    }]));
};

const relationQuery = (userId, targetId) =>
    `and(requester_id.eq.${userId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${userId})`;

const mapFriendship = (friendship, currentUserId, usersById, presenceByUserId = new Map()) => {
    const otherUserId = friendship.requester_id === currentUserId
        ? friendship.addressee_id
        : friendship.requester_id;

    return {
        id: friendship.id,
        status: friendship.status,
        direction: friendship.requester_id === currentUserId ? 'outgoing' : 'incoming',
        created_at: friendship.created_at,
        updated_at: friendship.updated_at,
        user: usersById.get(otherUserId) || { id: otherUserId, username: 'Unknown user' },
        presence: presenceByUserId.get(otherUserId) || null
    };
};

const findAcceptedFriendship = async (currentUserId, friendshipId) => {
    const { data, error } = await supabase
        .from('friendships')
        .select(FRIENDSHIP_FIELDS)
        .eq('id', friendshipId)
        .eq('status', 'accepted')
        .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`)
        .single();

    if (error || !data) return null;
    return data;
};

router.get('/', async (req, res, next) => {
    try {
        const { data: relationships, error } = await supabase
            .from('friendships')
            .select(FRIENDSHIP_FIELDS)
            .or(`requester_id.eq.${req.user.id},addressee_id.eq.${req.user.id}`)
            .in('status', ['pending', 'accepted'])
            .order('updated_at', { ascending: false });

        if (error) throw error;

        const otherUserIds = (relationships || []).map((friendship) =>
            friendship.requester_id === req.user.id ? friendship.addressee_id : friendship.requester_id
        );
        const [usersById, presenceByUserId] = await Promise.all([
            fetchUsersByIds(otherUserIds),
            fetchPresenceByUserIds(otherUserIds)
        ]);

        const mapped = (relationships || []).map((friendship) =>
            mapFriendship(friendship, req.user.id, usersById, presenceByUserId)
        );

        res.json({
            friends: mapped.filter((item) => item.status === 'accepted'),
            incoming: mapped.filter((item) => item.status === 'pending' && item.direction === 'incoming'),
            outgoing: mapped.filter((item) => item.status === 'pending' && item.direction === 'outgoing')
        });
    } catch (err) {
        next(err);
    }
});

router.put('/presence', async (req, res, next) => {
    try {
        const body = req.body || {};
        const payload = {
            user_id: req.user.id,
            details: String(body.details || '').slice(0, 120),
            state: String(body.state || '').slice(0, 160),
            activity_type: String(body.activityType || 'Snowball').slice(0, 40),
            remaining_tasks: Number.isFinite(Number(body.remainingTasks)) ? Number(body.remainingTasks) : 0,
            today_remaining_tasks: Number.isFinite(Number(body.todayRemainingTasks)) ? Number(body.todayRemainingTasks) : 0,
            score: Number.isFinite(Number(body.score)) ? Number(body.score) : 0,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('friend_presence')
            .upsert(payload, { onConflict: 'user_id' })
            .select(PRESENCE_FIELDS)
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        next(err);
    }
});

router.get('/:id/messages', requireUUID('id'), async (req, res, next) => {
    try {
        const friendship = await findAcceptedFriendship(req.user.id, req.params.id);
        if (!friendship) return res.status(404).json({ error: 'Friendship not found' });

        const { data, error } = await supabase
            .from('friend_messages')
            .select(MESSAGE_FIELDS)
            .eq('friendship_id', friendship.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        res.json((data || []).reverse());
    } catch (err) {
        next(err);
    }
});

router.post('/:id/messages', requireUUID('id'), async (req, res, next) => {
    try {
        const body = String(req.body?.body || '').trim();
        if (!body) return res.status(400).json({ error: 'Message cannot be empty' });
        if (body.length > 1000) return res.status(400).json({ error: 'Message is too long' });

        const friendship = await findAcceptedFriendship(req.user.id, req.params.id);
        if (!friendship) return res.status(404).json({ error: 'Friendship not found' });

        const { data, error } = await supabase
            .from('friend_messages')
            .insert([{
                friendship_id: friendship.id,
                sender_id: req.user.id,
                body
            }])
            .select(MESSAGE_FIELDS)
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (err) {
        next(err);
    }
});

router.get('/search', async (req, res, next) => {
    try {
        const query = String(req.query.q || '').trim();
        if (query.length < 2) return res.json([]);

        const pattern = `%${query.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
        const [byUsername, byEmail, relationships] = await Promise.all([
            supabase
                .from('users')
                .select(USER_FIELDS)
                .ilike('username', pattern)
                .neq('id', req.user.id)
                .limit(8),
            supabase
                .from('users')
                .select(USER_FIELDS)
                .ilike('email', pattern)
                .neq('id', req.user.id)
                .limit(8),
            supabase
                .from('friendships')
                .select(FRIENDSHIP_FIELDS)
                .or(`requester_id.eq.${req.user.id},addressee_id.eq.${req.user.id}`)
        ]);

        if (byUsername.error) throw byUsername.error;
        if (byEmail.error) throw byEmail.error;
        if (relationships.error) throw relationships.error;

        const relationByUserId = new Map();
        (relationships.data || []).forEach((friendship) => {
            const otherUserId = friendship.requester_id === req.user.id
                ? friendship.addressee_id
                : friendship.requester_id;
            relationByUserId.set(otherUserId, {
                id: friendship.id,
                status: friendship.status,
                direction: friendship.requester_id === req.user.id ? 'outgoing' : 'incoming'
            });
        });

        const results = uniqById([...(byUsername.data || []), ...(byEmail.data || [])])
            .slice(0, 10)
            .map((user) => {
                const result = publicUser(user);
                delete result.email;
                return { ...result, relationship: relationByUserId.get(user.id) || null };
            });

        res.json(results);
    } catch (err) {
        next(err);
    }
});

router.post('/requests', async (req, res, next) => {
    try {
        const addresseeId = String(req.body?.userId || '').trim();
        if (!addresseeId) return res.status(400).json({ error: 'Friend user id is required' });
        if (addresseeId.length > 20) return res.status(400).json({ error: 'Invalid user id' });
        if (addresseeId === req.user.id) return res.status(400).json({ error: 'You cannot add yourself as a friend' });

        const { data: targetUser, error: targetError } = await supabase
            .from('users')
            .select(USER_FIELDS)
            .eq('id', addresseeId)
            .single();

        if (targetError || !targetUser) return res.status(404).json({ error: 'User not found' });

        const { data: existing, error: existingError } = await supabase
            .from('friendships')
            .select(FRIENDSHIP_FIELDS)
            .or(relationQuery(req.user.id, addresseeId))
            .maybeSingle();

        if (existingError) throw existingError;

        if (existing?.status === 'accepted') {
            return res.status(409).json({ error: 'You are already friends' });
        }

        if (existing?.status === 'pending') {
            return res.status(409).json({ error: 'Friend request already exists' });
        }

        const mutation = existing
            ? supabase
                .from('friendships')
                .update({
                    requester_id: req.user.id,
                    addressee_id: addresseeId,
                    status: 'pending',
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id)
                .select(FRIENDSHIP_FIELDS)
                .single()
            : supabase
                .from('friendships')
                .insert([{
                    requester_id: req.user.id,
                    addressee_id: addresseeId,
                    status: 'pending'
                }])
                .select(FRIENDSHIP_FIELDS)
                .single();

        const { data: request, error } = await mutation;
        if (error) throw error;

        res.status(201).json({
            ...mapFriendship(request, req.user.id, new Map([[targetUser.id, publicUser(targetUser)]]))
        });
    } catch (err) {
        next(err);
    }
});

router.post('/requests/:id/accept', requireUUID('id'), async (req, res, next) => {
    try {
        const { data: friendship, error } = await supabase
            .from('friendships')
            .update({
                status: 'accepted',
                updated_at: new Date().toISOString()
            })
            .eq('id', req.params.id)
            .eq('addressee_id', req.user.id)
            .eq('status', 'pending')
            .select(FRIENDSHIP_FIELDS)
            .single();

        if (error || !friendship) return res.status(404).json({ error: 'Friend request not found' });

        const usersById = await fetchUsersByIds([friendship.requester_id]);
        res.json(mapFriendship(friendship, req.user.id, usersById));
    } catch (err) {
        next(err);
    }
});

router.post('/requests/:id/decline', requireUUID('id'), async (req, res, next) => {
    try {
        const { error, count } = await supabase
            .from('friendships')
            .delete({ count: 'exact' })
            .eq('id', req.params.id)
            .eq('addressee_id', req.user.id)
            .eq('status', 'pending');

        if (error) throw error;
        if (count === 0) return res.status(404).json({ error: 'Friend request not found' });

        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

router.delete('/:id', requireUUID('id'), async (req, res, next) => {
    try {
        const { error, count } = await supabase
            .from('friendships')
            .delete({ count: 'exact' })
            .eq('id', req.params.id)
            .or(`requester_id.eq.${req.user.id},addressee_id.eq.${req.user.id}`);

        if (error) throw error;
        if (count === 0) return res.status(404).json({ error: 'Friendship not found' });

        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

export default router;
