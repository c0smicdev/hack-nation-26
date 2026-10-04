# Brand guidelines

Visual rules for the Socrates UI. Cool, faintly green-tinted grays with a deep forest-green accent: calm, trustworthy, a little scholarly.

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
| **Mist** (main) | `#F6F8F7` | Page background, cards, popovers |
| **Fog** | `#EDF1EF` | Less prominent surfaces: muted/secondary areas, sidebar, inputs at rest |
| **Forest** (dark accent) | `#064420` | Socrates wordmark, primary buttons, focus ring, links, active nav |
| **Mint** (light accent) | `#E4EFE7` | Hover and selected states, highlights, badges, success hints |

Derived neutrals (not part of the core palette, tune if needed):

| Name | Hex | Use |
| --- | --- | --- |
| Ink | `#1A2620` | Body text (green-tinted near-black) |
| Stone | `#66706B` | Muted text (green-gray), captions, timestamps |
| Seam | `#DDE4E0` | Borders, dividers (green-gray), input outlines |

Keep the existing red for `--destructive`.

## Mapping to shadcn tokens

Set in `:root` in `web/src/index.css`:

| Token | Color |
| --- | --- |
| `--background`, `--card`, `--popover` | Mist `#F6F8F7` |
| `--foreground`, `--card-foreground`, `--popover-foreground` | Ink `#1A2620` |
| `--primary`, `--sidebar-primary`, `--ring` | Forest `#064420` |
| `--primary-foreground`, `--sidebar-primary-foreground` | Mist `#F6F8F7` |
| `--secondary`, `--muted`, `--sidebar` | Fog `#EDF1EF` |
| `--secondary-foreground`, `--accent-foreground`, `--sidebar-accent-foreground` | Forest `#064420` |
| `--muted-foreground` | Stone `#66706B` |
| `--accent`, `--sidebar-accent` | Mint `#E4EFE7` |
| `--border`, `--input`, `--sidebar-border` | Seam `#DDE4E0` |
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

- Wordmark: "Socrates" in the same style as page titles (Rethink Sans SemiBold, `tracking-tight`), in Forest.
- Icon tile: Forest background, Mist icon, `rounded-lg`.

## Don'ts

- No pure white (`#FFFFFF`) or warm beige surfaces. Use Mist and Fog.
- Use Forest for emphasis (text, buttons, small marks), not for large fills.
- Don't introduce new accent colors. Use Mint for highlights.
- The **mock ERP** (`features/erp/`) keeps its own neutral slate look, so it reads as a separate app in the demo.
