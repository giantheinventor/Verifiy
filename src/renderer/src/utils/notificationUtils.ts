/**
 * Utility functions for handling browser/OS notifications
 */

/**
 * Requests permission to send system notifications
 * @returns Promise resolving to true if permission granted
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notification')
    return false
  }

  if (Notification.permission === 'granted') {
    return true
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  }

  return false
}

/**
 * Sends a system notification if permission is granted
 * @param title Notification title
 * @param body Notification body text
 */
export const sendClaimNotification = (title: string, body: string): void => {
  if (!('Notification' in window)) return

  if (Notification.permission === 'granted') {
    new Notification(title, {
      body,
      silent: false
      // Icon path relative to therenderer process or checking standard locations
      // Note: Electron handles app icon by default on macOS usually
    })
  }
}
