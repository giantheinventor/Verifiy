import React from 'react'

interface IconProps {
    size?: number
    className?: string
}

// Menu icon (hamburger)
export const MenuIcon: React.FC<IconProps> = ({ size = 24, className }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className={className}
    >
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
)

// Screen/Monitor icon
export const ScreenIcon: React.FC<IconProps> = ({ size = 20, className }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={className}
    >
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
)

// Microphone icon
export const MicIcon: React.FC<IconProps> = ({ size = 20, className }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={className}
    >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
)

// Merge icon (two inputs combining into one output)
export const MergeIcon: React.FC<IconProps> = ({ size = 20, className }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M2 4 C9 4, 7 12, 12 12" />
        <path d="M2 20 C9 20, 7 12, 12 12" />
        <path d="M12 12 L21 12" />
        <polyline points="18 9 21 12 18 15" />
    </svg>
)

// No Input / Disabled icon
export const NoInputIcon: React.FC<IconProps> = ({ size = 20, className }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={className}
    >
        <circle cx="12" cy="12" r="10" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
)

// Soundwave / Audio bars icon
export const SoundwaveIcon: React.FC<IconProps> = ({ size = 80, className }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className={className}
    >
        <line x1="4" y1="12" x2="4" y2="12" />
        <line x1="8" y1="8" x2="8" y2="16" />
        <line x1="12" y1="4" x2="12" y2="20" />
        <line x1="16" y1="8" x2="16" y2="16" />
        <line x1="20" y1="12" x2="20" y2="12" />
    </svg>
)

// Export all icons as a namespace for convenient usage
const Icons = {
    Menu: MenuIcon,
    Screen: ScreenIcon,
    Mic: MicIcon,
    Merge: MergeIcon,
    NoInput: NoInputIcon,
    Soundwave: SoundwaveIcon
}

export default Icons
