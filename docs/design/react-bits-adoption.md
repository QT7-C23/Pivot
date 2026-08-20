# React Bits adoption boundary

Pivot uses React Bits as an interaction reference, not as a page template or a runtime dependency.

## License boundary

The upstream repository currently uses `MIT + Commons Clause License Condition v1.0`, not the standard MIT license. It permits use as part of an application, website, or product, but restricts selling, sublicensing, or redistributing the components themselves, including bundled or ported versions.

Because Pivot is source-distributed and plans a component/plugin ecosystem:

- no additional React Bits component source may be copied into the repository;
- new motion work must be implemented from a Pivot-owned specification, without consulting upstream source during implementation;
- copied names, assets, documentation, and distinctive source structure are prohibited;
- the existing Spotlight-derived implementation keeps its notice and requires a provenance/similarity review before a public source release;
- written upstream permission is required if a future feature needs direct component-source reuse.

## Adopted

- A restrained pointer-following spotlight for high-value decision surfaces.
- Direct CSS custom-property updates so pointer movement does not trigger React renders.

## Pivot-specific contract

- Colors come only from Pivot tokens (`--focus-accent`, `--focus-panel`, and related surface tokens).
- Effects are limited to welcome-mode choices and Provider selection buttons.
- Touch pointers keep a static surface; mouse and pen pointers may reveal the spotlight.
- Pointer writes are throttled to one animation frame and never use component state.
- `prefers-reduced-motion: reduce` removes the effect entirely.
- Keyboard focus remains the existing border/focus-ring contract; light movement is never required to understand state.

## Not adopted

- Decorative page backgrounds, text animations, cursor replacement, and high-motion transitions.
- React Bits as a package dependency or a general-purpose component catalog.
- Direct source redistribution of React Bits components.
- Any component whose license notice cannot be shipped with the installer.

The upstream license is retained in `THIRD_PARTY_NOTICES.md` and included as an installer resource.
