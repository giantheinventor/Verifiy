import Icons from './Icons'

interface SidebarProps {
    isOpen: boolean
    onClose: () => void
    isDarkMode: boolean
    onToggleTheme: () => void
    authMode: 'apiKey' | 'oauth' | null
    hasOAuthLogin: boolean
    hasApiKey: boolean
    onToggleAuthMode: () => void
    onManageApiKey: () => void
    onLogin: () => void
    onLogout: () => void
}

export function Sidebar({
    isOpen,
    onClose,
    isDarkMode,
    onToggleTheme,
    authMode,
    hasOAuthLogin,
    hasApiKey,
    onToggleAuthMode,
    onManageApiKey,
    onLogin,
    onLogout
}: SidebarProps): React.JSX.Element | null {
    if (!isOpen) return null

    const canToggleAuth = (hasOAuthLogin && authMode === 'apiKey') || (hasApiKey && authMode === 'oauth')
    const isLoggedIn = hasOAuthLogin

    return (
        <>
            {/* Backdrop */}
            <div className="sidebar-overlay" onClick={onClose} />

            {/* Sidebar Panel */}
            <div className="sidebar">
                <div className="sidebar-header">
                    <h2 className="sidebar-title">Settings</h2>
                    <button className="sidebar-close" onClick={onClose}>
                        <Icons.Close size={20} />
                    </button>
                </div>

                <div className="sidebar-content">
                    {/* Theme Toggle - First */}
                    <button className="sidebar-item sidebar-item-theme" onClick={onToggleTheme}>
                        <span className="sidebar-item-icon">
                            {isDarkMode ? <Icons.Moon size={20} /> : <Icons.Sun size={20} />}
                        </span>
                        <span className="sidebar-item-label">
                            {isDarkMode ? 'Dark Theme' : 'Light Theme'}
                        </span>
                        <span className="sidebar-item-toggle">
                            <div className={`toggle-switch ${isDarkMode ? 'active' : ''}`}>
                                <div className="toggle-knob" />
                            </div>
                        </span>
                    </button>

                    {/* Auth Mode Toggle - Second */}
                    <button
                        className="sidebar-item sidebar-item-auth"
                        onClick={onToggleAuthMode}
                        disabled={!canToggleAuth}
                        title={!canToggleAuth ? 'Need both OAuth and API key to toggle' : ''}
                    >
                        <span className="sidebar-item-icon">
                            <Icons.Key size={20} />
                        </span>
                        <span className="sidebar-item-label">
                            Mode: {authMode === 'oauth' ? 'Google' : authMode === 'apiKey' ? 'API Key' : 'None'}
                        </span>
                    </button>

                    {/* Manage API Key */}
                    <button className="sidebar-item sidebar-item-api-key" onClick={onManageApiKey}>
                        <span className="sidebar-item-icon">
                            <Icons.Settings size={20} />
                        </span>
                        <span className="sidebar-item-label">Manage API Key</span>
                    </button>

                    {/* Login/Logout */}
                    <button
                        className="sidebar-item sidebar-item-login"
                        onClick={isLoggedIn ? onLogout : onLogin}
                    >
                        <span className="sidebar-item-icon">
                            {isLoggedIn ? <Icons.Logout size={20} /> : <Icons.Login size={20} />}
                        </span>
                        <span className="sidebar-item-label">
                            {isLoggedIn ? 'Logout' : 'Login with Google'}
                        </span>
                    </button>
                </div>
            </div>
        </>
    )
}
