// src/lib/theme-inline-script.ts
/**
 * Runs before paint (beforeInteractive). Reconciles cookie vs localStorage and sets
 * data-theme + color-scheme + .dark on <html> so both theme worlds match before first paint.
 * Kept dependency-free and tiny; stringified into a <script>.
 */
export const THEME_INLINE_SCRIPT = `(function(){try{
var d=document.documentElement;
var m=document.cookie.match(/(?:^|; )theme=([^;]+)/);
var c=m?decodeURIComponent(m[1]):null;
var s=null;try{s=localStorage.getItem('sj-theme');}catch(e){}
if(c&&c.charAt(0)==='{'){c=null;}
var t=s||c||'system';
if(t!=='light'&&t!=='dark'&&t!=='system'){t='system';}
d.dataset.theme=t;
var r=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;
d.style.colorScheme=r;
d.classList.toggle('dark',r==='dark');
}catch(e){}})();`;
