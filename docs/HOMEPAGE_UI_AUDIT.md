# Homepage typography and balance audit

Date: 2026-10-24

## Scope and user constraints

Review the current homepage after the readability correction made its typography too large and heavy. Preserve the existing three-column composition, animated pink grid, branding, content and functions. Fit PC/laptop content within the viewport without vertical scrolling. Intermediate laptop sizes retain the desktop composition with proportional geometry; only mobile changes layout. This is a typography and spacing correction, not a layout redesign.

## Findings

- Text hierarchy collapsed: navigation, buttons, metadata, package discounts and labels frequently use weight 800. Most components demand attention simultaneously.
- Scaling a 24-unit body, 20-unit metadata and 18-unit eyebrow produces oversized desktop utility text. Simply reducing these design-unit values would recreate undersized laptop text.
- Three prominent Changa One headings compete with functional card headings. The typeface already has a heavy visual shape at its normal weight.
- Tight heading line heights of 1–1.05 and large notice titles make the center column feel packed despite available space elsewhere.
- Enlarged product metadata makes the dark caption compete with the bottle. Repeated uppercase labels and bold secondary copy add unnecessary visual noise.

## Typography decisions

Use bounded physical font sizes independently from the proportional geometry unit. The laptop floor protects legibility while the desktop ceiling prevents inflation. These are intended computed CSS pixel ranges, not point sizes or a claim about physical display size.

| Role | Size range | Family | Weight | Line height |
| --- | --- | --- | --- | --- |
| Main content | 15–18px | Mona Sans | 400–500 | 1.4–1.45 |
| Notice title | 15–18px | Mona Sans | 600 | 1.3–1.4 |
| Navigation and button text | 15–17px | Mona Sans | 600 | 1.25–1.35 |
| Supporting description and timestamp | 13–15px | Mona Sans | 400–500 | 1.35–1.45 |
| Eyebrow and short label | 12–12.5px | Mona Sans | 600 | 1.3 |
| Functional card heading | 22–28px | Mona Sans | 650–700 | 1.18 |
| Promotional heading | 25–33px | Changa One | 400 | 1.12 |
| Profile name | 21–25px | Mona Sans | 600–650 | 1.2 |
| Balance number | 42–56px | Mona Sans | 700 | 1.05 |
| Profile statistic | 24–28px | Mona Sans | 650 | 1.15 |
| Product caption title | 20–22px | Mona Sans | 650 | 1.2 |
| Product caption metadata | 13–14px | Mona Sans | 400–500 | 1.4 |

Mona Sans carries functional information. Reserve Changa One for the showcase invitation and promotional banner. Use Mona Sans for the daily check-in heading. Keep Luckiest Guy available in the brand font system; this correction does not require introducing a third visible heading treatment.

Use moderate negative tracking on headings (approximately -0.025em) and the balance (-0.045em). Keep ordinary body tracking normal. Eyebrows may use approximately 0.06–0.07em tracking; do not compensate for smaller labels with maximum weight.

## Spacing and emphasis decisions

- Keep card dimensions and the three-column composition. Do not shrink cards merely because their typography becomes calmer.
- Retain comfortable row/button heights after lowering font weight and size. Free space becomes breathing room rather than another reason to enlarge text.
- Aim for approximately 22–26 proportional design units of card padding and 14–18 units between card headings and content, subject to viewport fit.
- Primary actions retain their existing strong color and clear position; weight 600 is sufficient. Secondary text actions remain visually lighter. Do not introduce additional filled actions or new competing accents.
- Reduce product caption text emphasis so the bottle remains the left column's focus. Descriptive copy should support the product name.
- Keep secondary descriptions and timestamps dark enough to read. Avoid relying on low opacity to establish hierarchy.
- Keep long notice titles readable; validate actual wrapping or truncation at laptop sizes rather than assuming desktop measurements apply.

## Verification checklist

Completed implementation was reviewed independently in source. Browser measurements, interaction checks and project-check results below were performed and reported by the implementing parent agent.

- [x] Desktop measurements at 1920×1080, 1920×956, 1366×768, 1280×720 and 1024×768: document dimensions equal the viewport, three columns remain present, and no vertical scrolling is required.
- [x] No checked buttons, links, paragraphs or h2 elements inside `.home-card` extend beyond their card bounds at those desktop sizes. This includes the shorter promotional banner's content and action.
- [x] Source-derived laptop typography at a 1366/1920 scale is approximately 15.11px body, 13px supporting text, 12px labels, 23.38px functional headings and 27.22px promotional headings. These agree with the intended bounds.
- [x] Independent source and screenshot review confirms a calmer hierarchy: Mona Sans functional headings, Changa One limited to two promotional headings, weight 600 actions, and a visually secondary notifications action.
- [x] Mobile checked at 390×844: dedicated stacked layout, document content width 375px with scrollbar space, no horizontal overflow and no checked card content beyond card bounds.
- [x] Offer selection changes the CTA from `Top up 500` to `Top up 200`; daily claim displays `Reward claimed`.
- [x] Navigation link destinations were reviewed in source. Route navigation was not clicked as part of this validation.
- [x] Lint and production build passed. Build retains the existing `metadataBase` warning.

## Independent post-change findings

The CSS implementation follows the recommended bounded type hierarchy and separates text sizing from scaled geometry. It does not apply a page transform or text-blurring filter. The reviewed laptop screenshot contains selectively blurred or stale regions alongside sharply rendered notice text; that capture alone cannot establish a source typography defect. The independently raised concern about the shorter promotional row was resolved by the parent agent's browser bounds checks across the desktop sizes above. No further font enlargement or blanket reduction is recommended on the current evidence.

## Audit method

Reviewed the supplied screenshot, `components/labellab/HomePage.tsx`, and the homepage rules in `app/globals.css`. Read the UI UX Pro Max skill as supporting guidance. Its search script could not run through `python` or `py` in the available PATH; these recommendations are direct interface observations and design judgments, not claimed database search results. No CSS or component changes were made by the audit agent.
