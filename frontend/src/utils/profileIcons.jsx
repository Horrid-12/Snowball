import React from 'react';
import {
    BookOpen,
    Brain,
    Bird,
    Cat,
    Circle,
    Code2,
    Coffee,
    Dog,
    Fish,
    Flame,
    Gamepad2,
    Moon,
    PawPrint,
    Rabbit,
    Music,
    Rocket,
    Snowflake,
    Star,
    Trophy,
    Turtle
} from 'lucide-react';

export const PROFILE_ICON_PRESETS = [
    { id: 'snowball', label: 'Snowball', icon: Circle },
    { id: 'snowflake', label: 'Frost', icon: Snowflake },
    { id: 'cat', label: 'Cat', icon: Cat },
    { id: 'dog', label: 'Dog', icon: Dog },
    { id: 'paw', label: 'Paw', icon: PawPrint },
    { id: 'bird', label: 'Bird', icon: Bird },
    { id: 'fish', label: 'Fish', icon: Fish },
    { id: 'rabbit', label: 'Rabbit', icon: Rabbit },
    { id: 'turtle', label: 'Turtle', icon: Turtle },
    { id: 'flame', label: 'Flame', icon: Flame },
    { id: 'rocket', label: 'Rocket', icon: Rocket },
    { id: 'trophy', label: 'Trophy', icon: Trophy },
    { id: 'brain', label: 'Brain', icon: Brain },
    { id: 'gamepad', label: 'Game', icon: Gamepad2 },
    { id: 'book', label: 'Book', icon: BookOpen },
    { id: 'code', label: 'Code', icon: Code2 },
    { id: 'moon', label: 'Moon', icon: Moon },
    { id: 'star', label: 'Star', icon: Star },
    { id: 'coffee', label: 'Coffee', icon: Coffee },
    { id: 'music', label: 'Music', icon: Music }
];

const iconById = new Map(PROFILE_ICON_PRESETS.map((preset) => [preset.id, preset.icon]));

export const ProfileIcon = ({ iconId, fallbackText = '?', size = 36, iconSize = 18, style = {} }) => {
    const Icon = iconById.get(iconId) || null;

    return (
        <div style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: 'color-mix(in srgb, var(--accent-color) 18%, var(--bg-secondary))',
            color: 'var(--accent-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: `${Math.max(0.75, size / 42)}rem`,
            fontWeight: 800,
            flexShrink: 0,
            ...style
        }}>
            {Icon
                ? <Icon size={iconSize} strokeWidth={2.4} />
                : String(fallbackText || '?').trim().slice(0, 1).toUpperCase()}
        </div>
    );
};
