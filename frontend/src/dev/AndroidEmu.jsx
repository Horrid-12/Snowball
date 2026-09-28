import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './AndroidEmu.css';

const STORAGE_KEY = 'snowball_android_emu';
const LOOK_STYLE_ID = 'ae-look-style';
const FONT_LINK_ID = 'ae-roboto-link';
const ROBOTO_HREF = 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap';

const PRESETS = [
    { id: 'pixel7', label: 'Pixel 7', width: 412, height: 915 },
    { id: 'compact', label: 'Compact', width: 360, height: 800 },
    { id: 'tall', label: 'Tall 20:9', width: 360, height: 1010 },
    { id: 'tablet', label: 'Tablet', width: 800, height: 1280 },
];

const DEFAULT_OPTIONS = {
    statusBar: true,
    navBar: true,
    ripple: true,
    roboto: true,
    hideScrollbars: true,
    safeArea: true,
};

// Chrome heights emulated by the overlay bars. Used to fake env(safe-area-inset-*),
// which always resolves to 0 inside an iframe.
const INSET_TOP = 26;
const INSET_BOTTOM = 24;

const readInitialEnabled = () => {
    try {
        const forced = new URLSearchParams(window.location.search).get('android');
        if (forced === '1' || forced === 'true') return true;
        if (forced === '0' || forced === 'false') return false;
        return window.localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
};

const buildPreviewSrc = () => {
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete('android');
        url.hash = '';
        return url.toString();
    } catch {
        return window.location.href;
    }
};

const parseRgb = (value) => {
    const match = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(value || '');
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
};

// Relative luminance, used to pick status-bar ink that stays readable over the app.
const readableInk = (colorValue) => {
    const rgb = parseRgb(colorValue);
    if (!rgb) return '#f8fafc';
    const channels = rgb.map((value) => {
        const normalized = value / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    return luminance > 0.45 ? '#0f172a' : '#f8fafc';
};

const buildLookCss = (options) => `
/* Injected by the Android preview (dev only). */

${options.roboto ? `
html, body, #root, button, input, textarea, select, .tiptap-editor, .ProseMirror {
    font-family: 'Roboto', system-ui, -apple-system, sans-serif !important;
}
` : ''}

${options.hideScrollbars ? `
/* Android overlay scrollbars have no track or thumb. */
::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
* { scrollbar-width: none !important; }
` : ''}

${options.ripple ? `
/* Approximates Material touch feedback without a JS ripple layer. */
button:not(:disabled):active,
[role='button']:not([aria-disabled='true']):active,
.metadata-item:active,
.bottom-nav button:active {
    background-image: radial-gradient(circle at center,
        rgba(var(--accent-rgb, 59, 130, 246), 0.30) 0%,
        rgba(var(--accent-rgb, 59, 130, 246), 0.16) 42%,
        transparent 72%) !important;
    background-repeat: no-repeat !important;
    background-size: 240% 240% !important;
    background-position: 50% 50% !important;
    opacity: 0.82;
    transition: opacity 110ms ease-out !important;
}
` : ''}

${options.safeArea ? `
/* A WebView with viewport-fit=cover reports real insets here; an iframe never does.
   Re-declare the app's inset-aware rules against the emulated bar heights. */
.bottom-nav { padding-bottom: calc(0.45rem + ${INSET_BOTTOM}px) !important; }

@media (max-width: 768px) {
    .expanded-notes-overlay {
        padding:
            max(0.5rem, ${INSET_TOP}px)
            max(0.5rem, 0px)
            max(0.5rem, ${INSET_BOTTOM}px)
            max(0.5rem, 0px) !important;
    }
}

@media (max-width: 480px) {
    .bottom-nav { padding-bottom: calc(0.28rem + ${INSET_BOTTOM}px) !important; }
}

@media (max-width: 380px) {
    .bottom-nav { padding-bottom: calc(0.22rem + ${INSET_BOTTOM}px) !important; }
}
` : ''}
`;

const injectLook = (doc, options) => {
    if (!doc) return;

    if (options.roboto && !doc.getElementById(FONT_LINK_ID)) {
        const link = doc.createElement('link');
        link.id = FONT_LINK_ID;
        link.rel = 'stylesheet';
        link.href = ROBOTO_HREF;
        doc.head.appendChild(link);
    }

    let style = doc.getElementById(LOOK_STYLE_ID);
    if (!style) {
        style = doc.createElement('style');
        style.id = LOOK_STYLE_ID;
        doc.head.appendChild(style);
    }
    style.textContent = buildLookCss(options);
};

const useClock = () => {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 20000);
        return () => window.clearInterval(id);
    }, []);
    return now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const SignalIcon = () => (
    <svg width="15" height="12" viewBox="0 0 15 12" aria-hidden="true">
        <rect x="0" y="8" width="2.6" height="4" rx="0.6" />
        <rect x="4.1" y="5.6" width="2.6" height="6.4" rx="0.6" />
        <rect x="8.2" y="3" width="2.6" height="9" rx="0.6" />
        <rect x="12.3" y="0" width="2.6" height="12" rx="0.6" opacity="0.35" />
    </svg>
);

const WifiIcon = () => (
    <svg width="15" height="12" viewBox="0 0 15 12" aria-hidden="true">
        <path d="M7.5 9.1a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Z" />
        <path d="M4.2 6.3a4.7 4.7 0 0 1 6.6 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M1.6 3.6a8.4 8.4 0 0 1 11.8 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
);

const BatteryIcon = () => (
    <svg width="20" height="12" viewBox="0 0 20 12" aria-hidden="true">
        <rect className="ae-battery" x="0.5" y="0.5" width="16" height="11" rx="3" />
        <rect className="ae-battery-low" x="2.3" y="2.3" width="2.6" height="7.4" rx="1.2" />
        <path d="M18.4 4v4a2.1 2.1 0 0 0 0-4Z" fill="currentColor" opacity="0.5" />
    </svg>
);

function AndroidEmu() {
    const [enabled, setEnabled] = useState(readInitialEnabled);
    const [presetId, setPresetId] = useState(PRESETS[0].id);
    const [options, setOptions] = useState(DEFAULT_OPTIONS);
    const [panelOpen, setPanelOpen] = useState(false);
    const [ink, setInk] = useState('#f8fafc');
    const [scale, setScale] = useState(1);
    const [reloadKey, setReloadKey] = useState(0);

    const stageRef = useRef(null);
    const frameRef = useRef(null);
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const preset = useMemo(
        () => PRESETS.find((entry) => entry.id === presetId) || PRESETS[0],
        [presetId]
    );

    const previewSrc = useMemo(buildPreviewSrc, [reloadKey]);
    const clock = useClock();

    const syncInk = useCallback(() => {
        const doc = frameRef.current?.contentDocument;
        if (!doc?.body) return;
        try {
            setInk(readableInk(window.getComputedStyle(doc.body).backgroundColor));
        } catch {
            /* frame not ready yet */
        }
    }, []);

    const applyLook = useCallback(() => {
        injectLook(frameRef.current?.contentDocument, optionsRef.current);
    }, []);

    // Keep the hidden page behind the stage from scrolling or taking focus.
    useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle('ae-active', enabled);
        const appRoot = document.getElementById('root');
        if (appRoot) appRoot.inert = enabled;
        return () => root.classList.remove('ae-active');
    }, [enabled]);

    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
        } catch {
            /* storage unavailable */
        }
    }, [enabled]);

    // Shortcut: Ctrl+Shift+A (the parent page only sees its own key events; the
    // preview iframe has a separate document, so this cannot shadow app shortcuts).
    useEffect(() => {
        const onKeyDown = (event) => {
            if (!event.ctrlKey || !event.shiftKey) return;
            if (event.key.toLowerCase() !== 'a') return;
            event.preventDefault();
            setEnabled((prev) => !prev);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    // Scale the device down only when the browser window is smaller than it.
    useEffect(() => {
        const stage = stageRef.current;
        if (!stage) return undefined;
        const measure = () => {
            const { width, height } = stage.getBoundingClientRect();
            const next = Math.min(1, (width - 36) / preset.width, (height - 36) / preset.height);
            setScale(Number.isFinite(next) && next > 0 ? next : 1);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(stage);
        return () => observer.disconnect();
    }, [enabled, preset]);

    // Poll the preview's painted background so the system bars follow the app theme.
    useEffect(() => {
        if (!enabled) return undefined;
        syncInk();
        const id = window.setInterval(syncInk, 1000);
        return () => window.clearInterval(id);
    }, [enabled, syncInk]);

    useEffect(() => {
        if (enabled) applyLook();
    }, [enabled, applyLook, options, reloadKey]);

    const handleBack = useCallback(() => {
        try {
            frameRef.current?.contentWindow?.history.back();
        } catch {
            /* cross-origin frame */
        }
    }, []);

    const toggleOption = useCallback((key) => {
        setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
    }, []);

    return (
        <>
            {enabled && (
                <div className="ae-stage" ref={stageRef}>
                    <div
                        className="ae-device"
                        style={{ transform: `scale(${scale})` }}
                    >
                        <div
                            className="ae-screen"
                            style={{ width: preset.width, height: preset.height }}
                        >
                            <iframe
                                key={reloadKey}
                                ref={frameRef}
                                className="ae-viewport"
                                title="Snowball Android preview"
                                src={previewSrc}
                                onLoad={applyLook}
                            />

                            {options.statusBar && (
                                <div className="ae-statusbar" style={{ '--ae-ink': ink }}>
                                    <span className="ae-statusbar-clock">{clock}</span>
                                    <span className="ae-statusbar-icons">
                                        <SignalIcon />
                                        <WifiIcon />
                                        <BatteryIcon />
                                    </span>
                                </div>
                            )}

                            {options.navBar && (
                                <div className="ae-navbar" style={{ '--ae-ink': ink }}>
                                    <button
                                        type="button"
                                        className="ae-pill"
                                        title="Android back gesture"
                                        aria-label="Android back gesture"
                                        onClick={handleBack}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <button
                type="button"
                className="ae-toggle"
                data-on={enabled}
                onClick={() => {
                    setPanelOpen(!enabled);
                    setEnabled(!enabled);
                }}
                title="Toggle Android preview (Ctrl+Shift+A)"
            >
                <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="6" y="2" width="12" height="20" rx="2.5" />
                    <path d="M10.5 18.5h3" />
                </svg>
                ANDROID
            </button>

            {panelOpen && (
                <aside className="ae-panel">
                    <div className="ae-panel-head">
                        <span className="ae-panel-title">Android Preview</span>
                        <button
                            type="button"
                            className="ae-panel-close"
                            onClick={() => setPanelOpen(false)}
                            aria-label="Close panel"
                        >
                            &times;
                        </button>
                    </div>

                    <fieldset className="ae-panel-section">
                        <legend className="ae-panel-label">Device</legend>
                        <div className="ae-presets">
                            {PRESETS.map((entry) => (
                                <button
                                    key={entry.id}
                                    type="button"
                                    className="ae-preset"
                                    data-active={entry.id === presetId}
                                    onClick={() => setPresetId(entry.id)}
                                >
                                    {entry.label}
                                    <span className="ae-preset-size">
                                        {entry.width}&times;{entry.height}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    <fieldset className="ae-panel-section">
                        <legend className="ae-panel-label">Emulation</legend>
                        <div className="ae-options">
                            {[
                                ['statusBar', 'Status bar'],
                                ['navBar', 'Gesture nav bar'],
                                ['ripple', 'Material press feedback'],
                                ['roboto', 'Roboto system font'],
                                ['hideScrollbars', 'Hide scrollbars'],
                                ['safeArea', 'Safe-area insets'],
                            ].map(([key, label]) => (
                                <label key={key} className="ae-option">
                                    <input
                                        type="checkbox"
                                        checked={options[key]}
                                        onChange={() => toggleOption(key)}
                                    />
                                    {label}
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    <button
                        type="button"
                        className="ae-restart"
                        onClick={() => setReloadKey((prev) => prev + 1)}
                    >
                        Restart preview app
                    </button>

                    <p className="ae-panel-note">
                        <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> toggles the preview.
                        The preview runs a second app instance on the same account in an
                        iframe, so <code>vh</code> units and media queries resolve
                        exactly as they do on a device. Tap the gesture pill to go back.
                    </p>
                </aside>
            )}
        </>
    );
}

export function mountAndroidEmu() {
    if (document.getElementById('android-emu-root')) return;
    const host = document.createElement('div');
    host.id = 'android-emu-root';
    document.body.appendChild(host);
    createRoot(host).render(<AndroidEmu />);
}
