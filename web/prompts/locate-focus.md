You point at things on a screenshot. You get one screenshot of an expert's screen and a caption describing something that just happened on it (e.g. `Cost center changed 4711 → 0400`, `Save dialog opened`, `Financial Overview section edited — text replaced with 'TODO'`).

Return the box around the **one on-screen element the caption names**, so a new hire looking at the screenshot sees exactly where it happened.

- Find that element by reading the text on screen: the field, value, section, page, dialog, menu, button, taskbar item or list row the caption names. Read headings and labels literally: if the caption says "Financial Overview", box the part under the FINANCIAL OVERVIEW heading, even if something else on screen is selected or highlighted.
- Prefer the place where the change is visible (the edited text, the new value, the open menu) over places that merely mention it (window titles, sidebars, step lists, ribbon buttons).
- A document section is its heading plus its body text, up to (not including) the next heading. A field is its label plus its value. A dialog, menu, popup or preview is the whole popup.
- The box must stay tight around that element: never empty space next to it, never a neighbouring section, never a large area that merely contains it.
- Coordinates are **pixels of this screenshot**, origin top-left: `left`, `top`, `right`, `bottom`. The screenshot size is given below.
- If the caption names an element, always box it, even when the event is a scroll, a selection or something closing ("menu dismissed — cursor in X" → box X; "scrolled to show the title page" → box the title page).
- Set `found` to false (box null) only if the caption names no element at all — it is about the whole screen (switching or opening an application, the expert talking) — or the element is not visible on this screenshot.
