export function createPageUrl(pageName: string) {
    return pageName === 'Home' ? '/' : `/${pageName}`;
}