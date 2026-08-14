import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Check, MessageCircle, Search, Send, Trash2, UserPlus, Users, X } from 'lucide-react';
import { apiFetch, getUserData } from '../utils/apiClient.js';
import { getApiErrorMessage } from '../utils/api.js';
import { ProfileIcon } from '../utils/profileIcons.jsx';

const emptyFriendsState = { friends: [], incoming: [], outgoing: [] };

const Avatar = ({ user }) => (
    <ProfileIcon iconId={user?.profile_icon} fallbackText={user?.username} size={36} iconSize={18} />
);

const PillButton = ({ children, icon: Icon, tone = 'neutral', ...props }) => {
    const isAccent = tone === 'accent';
    const isDanger = tone === 'danger';

    return (
        <button
            {...props}
            style={{
                minHeight: 34,
                padding: children ? '0.45rem 0.7rem' : '0.45rem',
                borderRadius: '999px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                background: isAccent
                    ? 'var(--accent-color)'
                    : isDanger
                        ? 'color-mix(in srgb, var(--danger-color) 12%, transparent)'
                        : 'var(--bg-secondary)',
                border: `1px solid ${isAccent ? 'var(--accent-color)' : isDanger ? 'var(--danger-color)' : 'var(--border-color)'}`,
                color: isAccent ? '#fff' : isDanger ? 'var(--danger-color)' : 'var(--text-primary)',
                fontSize: '0.78rem',
                fontWeight: 700,
                opacity: props.disabled ? 0.6 : 1,
                cursor: props.disabled ? 'not-allowed' : 'pointer',
                ...props.style
            }}
        >
            {Icon && <Icon size={15} />}
            {children}
        </button>
    );
};

const PresenceBlock = ({ presence }) => {
    if (!presence) {
        return (
            <div style={{ marginTop: '0.45rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                No recent Snowball activity
            </div>
        );
    }

    return (
        <div style={{
            marginTop: '0.55rem',
            padding: '0.65rem',
            borderRadius: '0.8rem',
            background: 'color-mix(in srgb, var(--bg-card) 72%, var(--accent-color) 8%)',
            border: '1px solid color-mix(in srgb, var(--border-color) 80%, var(--accent-color) 20%)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.3rem' }}>
                <span style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: presence.is_online ? 'var(--success-color)' : 'var(--text-secondary)',
                    marginLeft: 'auto',
                    flexShrink: 0
                }} />
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {presence.details || 'In Snowball'}
            </div>
            <div style={{ marginTop: 2, fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                {presence.state || `Score ${Number(presence.score || 0).toFixed(1)}`}
            </div>
        </div>
    );
};

const FriendRow = ({ user, meta, presence, actions }) => (
    <div style={{
        padding: '0.75rem',
        borderRadius: '1rem',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)'
    }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', minWidth: 0, flex: '1 1 150px' }}>
                <Avatar user={user} />
                <div style={{ minWidth: 0 }}>
                    <div style={{
                        fontSize: '0.9rem',
                        fontWeight: 800,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}>
                        {user?.username || 'Unknown user'}
                    </div>
                    {meta && (
                        <div style={{
                            marginTop: 2,
                            fontSize: '0.72rem',
                            color: 'var(--text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }}>
                            {meta}
                        </div>
                    )}
                </div>
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flex: '1 0 100%', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                {actions}
            </div>
        </div>
        {presence !== undefined && <PresenceBlock presence={presence} />}
    </div>
);

const FriendsPanel = ({ compact = false }) => {
    const [friendsState, setFriendsState] = useState(emptyFriendsState);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [message, setMessage] = useState('');
    const [searchError, setSearchError] = useState('');
    const [activeFriend, setActiveFriend] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [chatDraft, setChatDraft] = useState('');
    const [chatError, setChatError] = useState('');

    const currentUserId = useMemo(() => {
        const user = getUserData();
        return user?.id || null;
    }, [friendsState]);

    const pendingCount = friendsState.incoming.length;
    const statusText = useMemo(() => {
        if (message) return message;
        if (loading) return 'Loading friends...';
        if (pendingCount > 0) return `${pendingCount} request${pendingCount === 1 ? '' : 's'} waiting`;
        return `${friendsState.friends.length} friend${friendsState.friends.length === 1 ? '' : 's'}`;
    }, [friendsState.friends.length, loading, message, pendingCount]);

    const fetchRetryRef = useRef(null);

    const loadFriends = useCallback(async ({ silent = false, isRetry = false } = {}) => {
        if (!silent && !isRetry) {
            setLoading(true);
        }
        try {
            const res = await apiFetch('/api/friends');
            const payload = await res.json().catch(() => null);

            // Retry on auth failures during Android cold start
            if (res.status === 401 || res.status === 403) {
                if (fetchRetryRef.current) clearTimeout(fetchRetryRef.current);
                fetchRetryRef.current = setTimeout(() => loadFriends({ silent, isRetry: true }), 3000);
                return;
            }

            if (!res.ok) throw new Error(getApiErrorMessage(payload, 'Failed to load friends'));
            setFriendsState({
                friends: payload?.friends || [],
                incoming: payload?.incoming || [],
                outgoing: payload?.outgoing || []
            });
            setActiveFriend((selected) => {
                if (!selected) return selected;
                return (payload?.friends || []).find((friend) => friend.id === selected.id) || null;
            });
            setMessage('');
        } catch (error) {
            setMessage(error.message || 'Failed to load friends');
            // Also retry on network error during cold start
            if (fetchRetryRef.current) clearTimeout(fetchRetryRef.current);
            fetchRetryRef.current = setTimeout(() => loadFriends({ silent, isRetry: true }), 3000);
        } finally {
            if (!silent && !isRetry) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        loadFriends();
        const interval = window.setInterval(() => {
            loadFriends({ silent: true });
        }, 10000);

        return () => window.clearInterval(interval);
    }, [loadFriends]);

    useEffect(() => {
        const query = searchQuery.trim();
        if (query.length < 2) {
            setSearchResults([]);
            setSearching(false);
            setSearchError('');
            return undefined;
        }

        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setSearching(true);
            try {
                const res = await apiFetch(`/api/friends/search?q=${encodeURIComponent(query)}`, {
                    signal: controller.signal
                });
                const payload = await res.json().catch(() => null);
                if (!res.ok) throw new Error(getApiErrorMessage(payload, 'Search failed'));
                setSearchResults(payload || []);
                setSearchError('');
                setMessage('');
            } catch (error) {
                if (error.name !== 'AbortError') {
                    setSearchResults([]);
                    setSearchError(error.message || 'Search failed');
                    setMessage(error.message || 'Search failed');
                }
            } finally {
                setSearching(false);
            }
        }, 250);

        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [searchQuery]);

    const mutateFriendship = async (id, endpoint, options = {}) => {
        setBusyId(id);
        setMessage('');
        try {
            const res = await apiFetch(endpoint, options);
            const payload = res.status === 204 ? null : await res.json().catch(() => null);
            if (!res.ok) throw new Error(getApiErrorMessage(payload, 'Friend action failed'));
            await loadFriends();
            return true;
        } catch (error) {
            setMessage(error.message || 'Friend action failed');
            return false;
        } finally {
            setBusyId(null);
        }
    };

    const sendRequest = async (userId) => {
        const didSend = await mutateFriendship(userId, '/api/friends/requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });
        if (!didSend) return;
        setSearchResults((results) => results.map((user) =>
            user.id === userId
                ? { ...user, relationship: { status: 'pending', direction: 'outgoing' } }
                : user
        ));
    };

    const acceptRequest = (requestId) =>
        mutateFriendship(requestId, `/api/friends/requests/${requestId}/accept`, { method: 'POST' });

    const declineRequest = (requestId) =>
        mutateFriendship(requestId, `/api/friends/requests/${requestId}/decline`, { method: 'POST' });

    const removeFriendship = (friendshipId) =>
        mutateFriendship(friendshipId, `/api/friends/${friendshipId}`, { method: 'DELETE' });

    const loadMessages = useCallback(async (friendshipId) => {
        if (!friendshipId) return;
        setMessagesLoading(true);
        setChatError('');
        try {
            const res = await apiFetch(`/api/friends/${friendshipId}/messages`);
            const payload = await res.json().catch(() => null);
            if (!res.ok) throw new Error(getApiErrorMessage(payload, 'Failed to load chat'));
            setMessages(payload || []);
        } catch (error) {
            setChatError(error.message || 'Failed to load chat');
        } finally {
            setMessagesLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!activeFriend?.id) {
            setMessages([]);
            return undefined;
        }

        loadMessages(activeFriend.id);
        const interval = window.setInterval(() => {
            loadMessages(activeFriend.id);
        }, 8000);

        return () => window.clearInterval(interval);
    }, [activeFriend?.id, loadMessages]);

    const sendMessage = async (event) => {
        event.preventDefault();
        const body = chatDraft.trim();
        if (!body || !activeFriend?.id) return;

        setBusyId(`message-${activeFriend.id}`);
        setChatError('');
        try {
            const res = await apiFetch(`/api/friends/${activeFriend.id}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body })
            });
            const payload = await res.json().catch(() => null);
            if (!res.ok) throw new Error(getApiErrorMessage(payload, 'Failed to send message'));
            setMessages((prev) => [...prev, payload]);
            setChatDraft('');
        } catch (error) {
            setChatError(error.message || 'Failed to send message');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <section
            className="friends-panel card-container"
            style={{
                background: 'var(--bg-card)',
                padding: compact ? '1rem' : 'var(--card-padding)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
                width: '100%',
                boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: compact ? '1rem' : '1.2rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Friends <Users size={18} color="var(--accent-color)" />
                    </h3>
                    <div style={{ marginTop: 4, fontSize: '0.75rem', color: message ? 'var(--danger-color)' : 'var(--text-secondary)' }}>
                        {statusText}
                    </div>
                </div>
                <PillButton icon={Search} onClick={loadFriends} disabled={loading} aria-label="Refresh friends" />
            </div>

            <label style={{ position: 'relative', display: 'block', marginBottom: '1rem' }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search username or email"
                    style={{
                        width: '100%',
                        padding: '0.75rem 0.85rem 0.75rem 2.3rem',
                        borderRadius: '999px',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)',
                        fontSize: '0.85rem'
                    }}
                />
            </label>

            {searchQuery.trim().length >= 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                        {searching ? 'Searching' : 'Search Results'}
                    </div>
                    {searchResults.map((user) => {
                        const relationship = user.relationship;
                        return (
                            <FriendRow
                                key={user.id}
                                user={user}
                                meta={relationship
                                    ? relationship.status === 'accepted'
                                        ? 'Already friends'
                                        : relationship.direction === 'incoming'
                                            ? 'Sent you a request'
                                            : 'Request sent'
                                    : (user.email || `@${user.username}`)}
                                actions={
                                    relationship
                                        ? <PillButton disabled icon={relationship.status === 'accepted' ? Check : Send}>{relationship.status === 'accepted' ? 'Friends' : 'Pending'}</PillButton>
                                        : <PillButton tone="accent" icon={UserPlus} disabled={busyId === user.id} onClick={() => sendRequest(user.id)}>Add</PillButton>
                                }
                            />
                        );
                    })}
                    {!searching && searchError && (
                        <div style={{ padding: '0.75rem', borderRadius: '1rem', color: 'var(--danger-color)', background: 'var(--bg-secondary)', fontSize: '0.82rem' }}>
                            {searchError}
                        </div>
                    )}
                    {!searching && !searchError && searchResults.length === 0 && (
                        <div style={{ padding: '0.75rem', borderRadius: '1rem', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', fontSize: '0.82rem' }}>
                            No matching Snowball users found.
                        </div>
                    )}
                </div>
            )}

            {friendsState.incoming.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Requests</div>
                    {friendsState.incoming.map((request) => (
                        <FriendRow
                            key={request.id}
                            user={request.user}
                            meta="Wants to connect"
                            actions={
                                <>
                                    <PillButton tone="accent" icon={Check} disabled={busyId === request.id} onClick={() => acceptRequest(request.id)}>Accept</PillButton>
                                    <PillButton tone="danger" icon={X} disabled={busyId === request.id} onClick={() => declineRequest(request.id)}>Decline</PillButton>
                                </>
                            }
                        />
                    ))}
                </div>
            )}

            {friendsState.outgoing.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Sent</div>
                    {friendsState.outgoing.map((request) => (
                        <FriendRow
                            key={request.id}
                            user={request.user}
                            meta="Waiting for reply"
                            actions={<PillButton tone="danger" icon={X} disabled={busyId === request.id} onClick={() => removeFriendship(request.id)}>Cancel</PillButton>}
                        />
                    ))}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Friends</div>
                {friendsState.friends.map((friend) => (
                    <FriendRow
                        key={friend.id}
                        user={friend.user}
                        meta={friend.presence?.is_online ? 'Online in Snowball' : 'Connected'}
                        presence={friend.presence}
                        actions={
                            <>
                                <PillButton tone={activeFriend?.id === friend.id ? 'accent' : 'neutral'} icon={MessageCircle} onClick={() => setActiveFriend(friend)}>Chat</PillButton>
                                <PillButton tone="danger" icon={Trash2} disabled={busyId === friend.id} onClick={() => removeFriendship(friend.id)}>Remove</PillButton>
                            </>
                        }
                    />
                ))}
                {!loading && friendsState.friends.length === 0 && (
                    <div style={{ padding: '1rem', borderRadius: '1rem', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', fontSize: '0.85rem', textAlign: 'center' }}>
                        Search for a Snowball user to start your friend list.
                    </div>
                )}
            </div>

            {activeFriend && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                            <Avatar user={activeFriend.user} />
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                    {activeFriend.user?.username}
                                </div>
                            </div>
                        </div>
                        <PillButton icon={X} onClick={() => setActiveFriend(null)} aria-label="Close chat" />
                    </div>

                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.45rem',
                        minHeight: 180,
                        maxHeight: 260,
                        overflowY: 'auto',
                        padding: '0.75rem',
                        borderRadius: '1rem',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)'
                    }}>
                        {messagesLoading && messages.length === 0 && (
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', textAlign: 'center', margin: 'auto' }}>
                                Loading messages...
                            </div>
                        )}
                        {!messagesLoading && messages.length === 0 && (
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', textAlign: 'center', margin: 'auto' }}>
                                No messages yet.
                            </div>
                        )}
                        {messages.map((item) => {
                            const fromMe = String(item.sender_id) === String(currentUserId);
                            return (
                                <div
                                    key={item.id}
                                    style={{
                                        alignSelf: fromMe ? 'flex-end' : 'flex-start',
                                        maxWidth: '82%',
                                        padding: '0.55rem 0.7rem',
                                        borderRadius: fromMe ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem',
                                        background: fromMe ? 'var(--accent-color)' : 'var(--bg-card)',
                                        color: fromMe ? '#fff' : 'var(--text-primary)',
                                        border: fromMe ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                                        fontSize: '0.84rem',
                                        lineHeight: 1.35,
                                        whiteSpace: 'pre-wrap',
                                        overflowWrap: 'anywhere'
                                    }}
                                >
                                    {item.body}
                                </div>
                            );
                        })}
                    </div>

                    {chatError && (
                        <div style={{ color: 'var(--danger-color)', fontSize: '0.75rem', marginTop: '0.6rem' }}>
                            {chatError}
                        </div>
                    )}

                    <form onSubmit={sendMessage} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                        <input
                            type="text"
                            value={chatDraft}
                            onChange={(event) => setChatDraft(event.target.value)}
                            placeholder={`Message ${activeFriend.user?.username}`}
                            maxLength={1000}
                            style={{
                                flex: 1,
                                minWidth: 0,
                                padding: '0.7rem 0.9rem',
                                borderRadius: '999px',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)',
                                fontSize: '0.85rem'
                            }}
                        />
                        <PillButton type="submit" tone="accent" icon={Send} disabled={!chatDraft.trim() || busyId === `message-${activeFriend.id}`} aria-label="Send message" />
                    </form>
                </div>
            )}
        </section>
    );
};

export default FriendsPanel;
