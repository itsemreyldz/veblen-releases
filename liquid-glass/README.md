# Liquid Glass

**Refraction instead of blur.** A dependency-free engine that bends whatever is behind an element like the curved edge of
real glass, while the centre stays perfectly sharp. It is the material used in the [VEBLEN](../README.md) terminal.

**[▶ Live demo](https://itsemreyldz.github.io/veblen-releases/liquid-glass/)** · or just open `index.html` — no build step, no server.

![Glass over a live chart in VEBLEN](../assets/hero-liquid-glass.png)

## Copy, paste, done

Copy `liquid-glass.css` and `glass.js` into your project:

```html
<link rel="stylesheet" href="liquid-glass.css">

<div data-liquid-glass>Anything inside stays crisp.</div>

<script src="glass.js"></script>
```

## Tuning

| Setting | Where | Default | Meaning |
|---|---|---|---|
| `data-lg-bezel` | attribute | `22` | width of the refracting edge band, px (capped at 34% of the short side) |
| `data-lg-strength` | attribute | `1.7` | bending; maximum shift is `bezel × strength / 2` px |
| `data-lg-chroma` | attribute | `0.09` | colour split between the red and blue passes |
| `--lg-tint` | CSS | `11, 13, 17` | tint colour as `r, g, b` |
| `--lg-alpha` | CSS | `.55` | tint opacity — raise it where text must stay readable |
| `border-radius` | CSS | `18px` | the lens follows it: rounded boxes, pills and circles |

```js
LiquidGlass.attach(element);   // elements added after load
LiquidGlass.detach(element);
LiquidGlass.refresh();         // after changing data-lg-* values
LiquidGlass.force(true);       // show the lens although the OS asks for reduced transparency (let the user choose)
```

## How it works

1. **Height map.** For each surface size, a canvas encodes a rounded-rectangle signed distance field: neutral grey in the
   centre, and along the edge a vector pointing inward whose length follows a convex lens profile.
2. **SVG filter.** `feImage` loads the map; three `feDisplacementMap` passes shift red, green and blue by slightly
   different amounts; `feBlend` recombines them.
3. **Backdrop.** The filter is applied through `backdrop-filter: url(#…)` on a `::before` layer, so the element's own
   content is never filtered and nested glass still sees the page.
4. **Specular rim.** Layered inset shadows add the white top highlight and the warm lower reflection.

## Know before you ship

- **Chromium only** for the refraction (Chrome, Edge, Brave, Opera, WebView2, Electron). Firefox and Safari get a denser
  tint instead — design so that the fallback still reads well.
- **One filter per size.** Chromium does not stretch a backdrop SVG filter to the element, so the engine rebuilds it on
  resize. Avoid animating the width or height of a glass surface.
- **Cost.** The filter re-runs whenever the frame is redrawn. In VEBLEN (about a dozen surfaces over a scrolling ticker,
  RTX 3070, 280 Hz display) the main screen went from about 280 fps without the filters to 53–66 fps with them; idle
  backdrops cost next to nothing. Keep surfaces few, pause what moves behind large ones, and switch it off in
  low-power states.
- **Backdrop root.** A parent with `opacity < 1`, `filter`, `mask` or its own `backdrop-filter` limits what the glass can
  see.
- **Accessibility.** `prefers-reduced-transparency` is honoured by default. Check text contrast against the brightest
  thing that can pass behind the glass.

## License

[MIT](LICENSE) — for the files in this folder only. VEBLEN itself is proprietary software.
