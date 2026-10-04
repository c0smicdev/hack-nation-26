# Brand guidelines

Visual rules for the Socrates UI. Warm paper tones with a deep forest-green accent: calm, trustworthy, a little scholarly.

## Typography

| Role | Font | Weight | Package |
| --- | --- | --- | --- |
| Headings (`h1`–`h3`, card / dialog / sheet titles) and the Socrates wordmark | **Rethink Sans** | SemiBold (600) | `@fontsource-variable/rethink-sans` |
| Body and UI text | **Geist** | Regular (400), Medium (500) for emphasis | `@fontsource-variable/geist` (installed) |

- Headings use `tracking-tight` at `text-2xl` and up.
- Don't use Rethink Sans for body text, buttons or labels.

## Colors

| Name | Hex | Use |
| --- | --- | --- |
| **Paper** (main) | `#FDFAF6` | Page background, cards, popovers |
| **Sand** | `#FAF1E6` | Less prominent surfaces: muted/secondary areas, sidebar, inputs at rest |
| **Forest** (dark accent) | `#064420` | Socrates wordmark, primary buttons, focus ring, links, active nav |
| **Mint** (light accent) | `#E4EFE7` | Hover and selected states, highlights, badges, success hints |

Derived neutrals (not part of the core palette, tune if needed):

| Name | Hex | Use |
| --- | --- | --- |
| Ink | `#1A2620` | Body text (green-tinted near-black) |
| Stone | `#6E6A62` | Muted text, captions, timestamps |
| Seam | `#EADFCF` | Borders, dividers, input outlines |

Keep the existing red for `--destructive`.

## Mapping to shadcn tokens

Set in `:root` in `web/src/index.css`:

| Token | Color |
| --- | --- |
| `--background`, `--card`, `--popover` | Paper `#FDFAF6` |
| `--foreground`, `--card-foreground`, `--popover-foreground` | Ink `#1A2620` |
| `--primary`, `--sidebar-primary`, `--ring` | Forest `#064420` |
| `--primary-foreground`, `--sidebar-primary-foreground` | Paper `#FDFAF6` |
| `--secondary`, `--muted`, `--sidebar` | Sand `#FAF1E6` |
| `--secondary-foreground`, `--accent-foreground`, `--sidebar-accent-foreground` | Forest `#064420` |
| `--muted-foreground` | Stone `#6E6A62` |
| `--accent`, `--sidebar-accent` | Mint `#E4EFE7` |
| `--border`, `--input`, `--sidebar-border` | Seam `#EADFCF` |
| `--chart-1` … `--chart-5` | Shades of Forest, light to dark |

Fonts, in the same file:

```css
@import "@fontsource-variable/rethink-sans";

@theme inline {
  --font-heading: "Rethink Sans Variable", sans-serif;
  --font-sans: "Geist Variable", sans-serif;
}

@layer base {
  h1, h2, h3 { @apply font-heading; }
}
```

No dark mode for now. Leave `.dark` alone.

## Logo

- Wordmark: "Socrates" in Rethink Sans SemiBold, Forest.
- Icon tile: Forest background, Paper icon, `rounded-lg`.

## Don'ts

- No pure white (`#FFFFFF`) or cool gray surfaces. Use Paper and Sand.
- Use Forest for emphasis (text, buttons, small marks), not for large fills.
- Don't introduce new accent colors. Use Mint for highlights.
- The **mock ERP** (`features/erp/`) keeps its own neutral slate look, so it reads as a separate app in the demo.
