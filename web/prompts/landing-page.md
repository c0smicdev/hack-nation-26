# Socrates Landing Page

Implementation brief, October 2026. This is the new design brief, not a recovered original prompt.

## Positioning

Build a business-facing product page for teams whose work depends on experienced colleagues' judgment. Explain how Socrates learns the reasoning behind work and turns it into guidance for someone else. Do not mention a hackathon, ERP, model names, frame sampling or judging criteria in the marketing story.

The brand is Socrates. The central promise is: "Your team's know-how. Ready for what's next." Show the product, not a wall of feature copy. No unverified savings, fabricated testimonials, customer logos or unsupported security claims.

## Visual Story

Use four connected chapters: Observe, Understand, Remember, Guide. Carry one illustrative supplier approval through all four. The expert's explanation, example company rule and resulting guidance must agree. Label fictional examples as illustrations, not customer results.

1. Observe: an experienced person works; a cursor and event trail reveal the decision.
2. Understand: a contextual spoken question uncovers the reason.
3. Remember: the explanation becomes a reviewed Work Map with its source.
4. Guide: a new person applies the same reasoning to a different case.

Include a usable amount slider demonstrating the boundary: EUR 5,000 follows the standard route; EUR 5,100 needs Finance review. This is an example company policy, not accounting advice. Add Finance, Customer operations and People operations examples without claiming shipped integrations.

## Art Direction

Quiet white surfaces with coral, mint and lime stages inside one scroll-driven story. A connected editorial object scene provides a recognizable visual identity. The header wordmark uses the same Georgia serif as the hero. Product illustrations are deterministic HTML and Lucide icons, not screenshots with invented or illegible labels. Keep layout dimensions stable during interaction.

The hero uses a custom bitmap background, with unobstructed text and the full object sequence visible. Maintain a hint of the next section. Avoid generic AI gradients, decorative orbs, excessive cards and enormous headings inside UI panels.

## Motion and Interaction

Use one sticky story stage, not four stacked panels or a click-through presentation. Native scrolling drives a GSAP ScrollTrigger timeline with smooth scrubbing: cursor, screen events, question, answer and resulting rule. Progress indicators are not required navigation. The scene stops when scrolling stops and reverses when scrolling back. There are no infinitely repeating animations and no pause button. Clean up animation contexts on unmount. Respect prefers-reduced-motion with instant stage changes. Do not hijack scrolling.

Navigation, team tabs, the approval illustration, slider and FAQ must work with keyboard and touch. Product links use the existing paths helpers. Do not invent a booking endpoint or send leads to an unapproved service.

## References

- https://www.clay.com/ - continuity across four distinct capabilities.
- https://attio.com/ - reduced workflow UI and active states.
- https://www.granola.ai/ - the same information transforming across stages.
- https://ramp.com/ - everyday business situations as visual stories.
- https://dust.tt/ - human context connected to work.
- https://www.tines.com/ - business outcomes connected to workflow examples.
- https://fin.ai/capabilities - comprehensible, ordered product chapters.
- https://www.tango.ai/ - relevant competitive positioning; capture and guidance are not unique claims.
- https://gsap.com/docs/v3/Plugins/ScrollTrigger/ - animation lifecycle and viewport triggers.

## Generated Asset

Built-in image generation tool. Final asset: web/public/images/landing/knowledge-path.png.

Prompt: "Create a premium wide landscape 3D editorial illustration for Socrates business software. On a pale cool-white seamless studio ground, along the bottom 45 percent, a continuous sculptural pathway connects four tactile objects: coral business folder with white invoice papers, transparent aqua glass conversation window with white speech shapes, lime folded branching decision diagram, and blue-green open book with guided process pages. Connect the objects with brushed chrome tracks. Slight isometric perspective, thick paper, satin lacquer, glass and aluminum, soft contact shadows, sophisticated B2B studio render. Top 55 percent empty for website typography. All four objects visible with ample margins. No text, logo, person, computer-screen mockup, gradient backdrop, purple, beige, brown, dark blue, watermark, loose balls or decorative blobs. Seamless full-width background, not a framed card."
