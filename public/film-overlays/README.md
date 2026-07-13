Put the no-number Kodak Gold 200 PNG template here:

```txt
public/film-overlays/kodak-gold-200.png
```

The renderer uses this asset when present. If the file is missing or cannot be loaded, it falls back to the programmatic 135 film border.

Kodak Portra 160 uses the flattened template:

```txt
public/film-overlays/kodak-portra-160.png
```

Both flattened templates must be `1307x1203` with the image aperture at
`x=92`, `y=211`, `width=1123`, `height=800`. The Portra source image was
normalized with piecewise edge and aperture resizing so the film reaches all
four canvas edges without black padding. Do not replace it with the raw
generated image because its aperture geometry differs.
