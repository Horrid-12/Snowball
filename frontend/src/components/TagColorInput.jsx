import { useEffect, useState } from 'react';
import { isFollowingTheme, normalizeHexColor } from '../utils/tagColors.js';

const isHexDraft = (value) => /^#?[0-9a-fA-F]{0,6}$/.test(value);
const isCompleteHex = (value) => /^#?[0-9a-fA-F]{6}$/.test(value);

const TagColorInput = ({ value, onChange, style = {}, disabled = false }) => {
    const [draft, setDraft] = useState(value);

    useEffect(() => {
        setDraft(value);
    }, [value]);

    const followingTheme = isFollowingTheme();
    const isDisabled = disabled || followingTheme;

    const commit = (nextValue) => {
        if (isCompleteHex(nextValue)) {
            onChange(normalizeHexColor(nextValue, value));
        }
    };

    return (
        <input
            type="text"
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={7}
            value={draft}
            disabled={isDisabled}
            title={followingTheme ? 'Tag colors follow the theme. Turn off "Follow theme" to edit them.' : undefined}
            onChange={(event) => {
                if (isDisabled) return;
                const nextValue = event.target.value.trim();
                if (!isHexDraft(nextValue)) return;
                setDraft(nextValue);
                commit(nextValue);
            }}
            onBlur={(event) => {
                if (isDisabled) return;
                const normalized = normalizeHexColor(event.target.value, value);
                setDraft(normalized);
                onChange(normalized);
            }}
            placeholder="#84cc16"
            style={{
                padding: '0.2rem 0.4rem',
                borderRadius: '0.4rem',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.7rem',
                fontFamily: 'monospace',
                opacity: isDisabled ? 0.6 : 1,
                cursor: isDisabled ? 'not-allowed' : 'text',
                ...style
            }}
        />
    );
};

export default TagColorInput;
