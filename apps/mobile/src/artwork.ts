/** Request larger provider artwork only on known image hosts; keep a usable fallback. */
export function artworkSources(source: string | null | undefined, large = false): string[] {
    if (!source) return [];
    const original = source;
    try {
        const url = new URL(source);
        if (url.protocol !== 'https:' || url.username || url.password) return [original];
        const size = large ? 1024 : 320;
        if (['.googleusercontent.com', '.ggpht.com'].some(host => url.hostname.endsWith(host))) {
            url.pathname = url.pathname.replace(/([=-])w\d+(?=-|$)/g, `$1w${size}`).replace(/([=-])h\d+(?=-|$)/g, `$1h${size}`);
        } else if (large && url.hostname.endsWith('.ytimg.com')) {
            url.pathname = url.pathname.replace(/\/(?:mqdefault|hqdefault|sddefault)\.(jpg|webp)$/, '/maxresdefault.$1');
        }
        return [...new Set([url.toString(), original])];
    } catch { return [original]; }
}
