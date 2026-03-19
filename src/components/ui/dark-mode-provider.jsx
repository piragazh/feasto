import * as React from 'react';

const DarkModeContext = React.createContext({
    isDark: false,
    toggleDarkMode: () => {},
});

export const useDarkMode = () => React.useContext(DarkModeContext);

export function DarkModeProvider({ children }) {
    const [isDark, setIsDark] = React.useState(false);

    React.useEffect(() => {
        const stored = localStorage.getItem('darkMode');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const shouldBeDark = stored ? stored === 'true' : systemPrefersDark;
        setIsDark(shouldBeDark);
        document.documentElement.classList.toggle('dark', shouldBeDark);

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e) => {
            if (!localStorage.getItem('darkMode')) {
                setIsDark(e.matches);
                document.documentElement.classList.toggle('dark', e.matches);
            }
        };
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    const toggleDarkMode = () => {
        setIsDark(prev => {
            const newValue = !prev;
            localStorage.setItem('darkMode', String(newValue));
            document.documentElement.classList.toggle('dark', newValue);
            return newValue;
        });
    };

    return (
        <DarkModeContext.Provider value={{ isDark, toggleDarkMode }}>
            {children}
        </DarkModeContext.Provider>
    );
}