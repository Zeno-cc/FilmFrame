Put the no-number Kodak Gold 200 PNG template here:

```txt
public/film-overlays/kodak-gold-200.png
```

The renderer uses this asset when present. If the file is missing or cannot be loaded, it falls back to the programmatic 135 film border.

The other 15 supported stocks use flattened templates:

```txt
public/film-overlays/kodak-portra-160.png
public/film-overlays/kodak-portra-400.png
public/film-overlays/kodak-ektar-100.png
public/film-overlays/kodak-portra-800.png
public/film-overlays/kodak-ultramax-400.png
public/film-overlays/kodak-colorplus-200.png
public/film-overlays/kodak-pro-image-100.png
public/film-overlays/kodak-ektachrome-e100.png
public/film-overlays/kodak-tri-x-400.png
public/film-overlays/kodak-tmax-100.png
public/film-overlays/kodak-tmax-400.png
public/film-overlays/kodak-tmax-p3200.png
public/film-overlays/fuji-superia-400.png
public/film-overlays/cinestill-800t.png
public/film-overlays/ilford-hp5-plus.png
```

Every flattened template must be `1307x1203` with the image aperture at
`x=92`, `y=211`, `width=1123`, `height=800`. Each source image is normalized
with per-image piecewise edge and aperture resizing so the film reaches all
four canvas edges without black padding. Do not replace a template with its
raw generated image because its aperture geometry differs.

Kodak Gold 200 remains the only layered template that is eligible for the
Worker renderer. Every flattened template is rendered on the main thread.
