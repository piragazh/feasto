export function createPageUrl(pageName: string) {
    if (typeof window !== 'undefined') {
        const customDomainRestaurantId = window.sessionStorage.getItem('customDomainRestaurantId');
        if (customDomainRestaurantId && pageName.toLowerCase() === 'home') {
            return '/';
        }
    }

    return '/' + pageName.replace(/ /g, '-');
}