import { useState, useEffect } from 'react';

/**
 * Hook to manage PWA install prompt.
 * index.html captures `beforeinstallprompt` into window.__pwaInstallPrompt
 * before React mounts. This hook reads it and keeps state in sync.
 */
export function usePWAInstall() {
    const [installPrompt, setInstallPrompt] = useState(null);
    const [isInstalled, setIsInstalled] = useState(false);
    const [isInstalling, setIsInstalling] = useState(false);

    useEffect(() => {
        // Check if already running in standalone (installed) mode
        if (
            window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true
        ) {
            setIsInstalled(true);
            return;
        }

        // Read the prompt captured in index.html (before React mounted)
        if (window.__pwaInstallPrompt) {
            setInstallPrompt(window.__pwaInstallPrompt);
        }

        // Also listen for the custom event in case it fires slightly after mount
        const onPromptReady = () => {
            if (window.__pwaInstallPrompt) {
                setInstallPrompt(window.__pwaInstallPrompt);
            }
        };

        // Listen for future prompt (e.g. if page is refreshed and event re-fires)
        const onBeforeInstall = (e) => {
            e.preventDefault();
            window.__pwaInstallPrompt = e;
            setInstallPrompt(e);
        };

        const onAppInstalled = () => {
            setIsInstalled(true);
            setInstallPrompt(null);
            window.__pwaInstallPrompt = null;
        };

        window.addEventListener('pwaInstallPromptReady', onPromptReady);
        window.addEventListener('beforeinstallprompt', onBeforeInstall);
        window.addEventListener('appinstalled', onAppInstalled);

        return () => {
            window.removeEventListener('pwaInstallPromptReady', onPromptReady);
            window.removeEventListener('beforeinstallprompt', onBeforeInstall);
            window.removeEventListener('appinstalled', onAppInstalled);
        };
    }, []);

    const promptInstall = async () => {
        if (!installPrompt) return false;
        setIsInstalling(true);
        try {
            await installPrompt.prompt();
            const { outcome } = await installPrompt.userChoice;
            if (outcome === 'accepted') {
                setIsInstalled(true);
                setInstallPrompt(null);
                window.__pwaInstallPrompt = null;
                return true;
            }
            return false;
        } finally {
            setIsInstalling(false);
        }
    };

    return {
        canInstall: !!installPrompt && !isInstalled,
        isInstalled,
        isInstalling,
        promptInstall,
    };
}