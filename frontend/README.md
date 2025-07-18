# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Animation Guidelines & Best Practices

- **Centralized Timing:** All animation durations and delays are controlled via CSS variables in `:root` in `index.css` (e.g., `--anim-duration`, `--anim-delay-stagger`). Adjust these to tune animation speed globally.
- **CSS-First:** Use CSS-based animations and transitions for UI effects and staggered entrances. Avoid JS timers for animation unless absolutely necessary (e.g., for complex or interactive effects).
- **JS Animation:** For custom JS-driven effects (like particles), always cap resource usage (e.g., max 200 particles) and debounce expensive operations (e.g., canvas resize). See `SessionForm.jsx` for a reference implementation.
- **Accessibility:** Always respect `prefers-reduced-motion`. Disable or minimize non-essential animations for users who prefer reduced motion. Test with this setting enabled.
- **Performance:** Profile animation performance on low-end devices and with reduced motion enabled. Use browser dev tools (Performance tab) to check for jank, dropped frames, and memory leaks.
- **Adding Animations:** When adding new animations, use the existing CSS variables for timing. Document any new variables in `index.css`.
- **Reference:** See `index.css` for variable names and usage examples.
- **Advanced Effects:** For heavy canvas/WebGL effects, consider using `OffscreenCanvas` or web workers in the future for better performance.
- **Testing Checklist:**
  1. No jank or dropped frames on low-end devices.
  2. No memory leaks (timers/raf/intervals cleaned up).
  3. Animations are disabled/minimized with reduced motion enabled.
  4. All animation durations/delays are tunable via CSS variables.
