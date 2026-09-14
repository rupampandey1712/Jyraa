/** @type {import('tailwindcss').Config} */

/*
 * The pages are written against Tailwind's `slate` scale, which is a cool
 * blue-grey. Azure DevOps uses Fluent's warm neutrals. Remapping the scale here
 * re-tones every existing `text-slate-500` / `border-slate-200` in the app
 * without touching the markup, and keeps the step ordering intact so relative
 * contrast between classes still reads the way each page intended.
 */
const fluentNeutral = {
  50: '#faf9f8',
  100: '#f3f2f1',
  200: '#e1dfdd',
  300: '#c8c6c4',
  400: '#a19f9d',
  500: '#605e5c',
  600: '#484644',
  700: '#3b3a39',
  800: '#323130',
  900: '#252423',
  950: '#201f1e',
};

module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        slate: fluentNeutral,
        gray: fluentNeutral,

        /* Communication blue, the single accent. */
        primary: {
          50: '#eff6fc',
          100: '#deecf9',
          200: '#c7e0f4',
          300: '#a9d3f2',
          400: '#2b88d8',
          500: '#0078d4',
          600: '#106ebe',
          700: '#005a9e',
          800: '#004578',
          900: '#003966',
        },
        /* Aliased to the accent so existing sky/blue utilities stay on-palette. */
        sky: {
          50: '#eff6fc',
          100: '#deecf9',
          200: '#c7e0f4',
          300: '#a9d3f2',
          400: '#2b88d8',
          500: '#0078d4',
          600: '#106ebe',
          700: '#005a9e',
          800: '#004578',
          900: '#003966',
        },

        /* Fluent status ramps. Reserved for state, never for decoration. */
        emerald: {
          50: '#f1faf1',
          100: '#dff6dd',
          200: '#bdda9b',
          300: '#92c353',
          400: '#4f9b31',
          500: '#107c10',
          600: '#0e700e',
          700: '#0b5a0b',
          800: '#094509',
          900: '#063306',
        },
        rose: {
          50: '#fdf3f4',
          100: '#fdd8db',
          200: '#f7adb4',
          300: '#e9808b',
          400: '#d1555f',
          500: '#a4262c',
          600: '#8e2126',
          700: '#751b1f',
          800: '#5c1518',
          900: '#430f12',
        },
        amber: {
          50: '#fff9f5',
          100: '#fed9cc',
          200: '#fdb292',
          300: '#f7894a',
          400: '#da3b01',
          500: '#ca5010',
          600: '#a74109',
          700: '#8a3707',
          800: '#6d2b05',
          900: '#4f1f04',
        },
        violet: {
          50: '#f7f4fb',
          100: '#e8dff3',
          200: '#cfb8e8',
          300: '#b48fdb',
          400: '#8764b8',
          500: '#5c2e91',
          600: '#4f2780',
          700: '#41206a',
          800: '#331955',
          900: '#26123f',
        },

        jira: {
          blue: '#0078d4',
          dark: '#201f1e',
          gray: '#605e5c',
          lightGray: '#e1dfdd',
          green: '#107c10',
          yellow: '#ca5010',
          red: '#a4262c',
          purple: '#5c2e91',
        },
      },
      borderRadius: {
        /* ADO corners: 2px on controls, 4px on cards. Nothing rounder. */
        DEFAULT: '4px',
        sm: '2px',
        md: '4px',
        lg: '4px',
        xl: '4px',
        '2xl': '4px',
        '3xl': '4px',
      },
      fontSize: {
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
        base: ['14px', '20px'],
        lg: ['16px', '22px'],
        xl: ['18px', '24px'],
        '2xl': ['20px', '28px'],
        '3xl': ['24px', '32px'],
      },
      boxShadow: {
        /* Fluent depth tokens; used only for things that genuinely float. */
        DEFAULT: '0 1.6px 3.6px rgba(0,0,0,0.13), 0 0.3px 0.9px rgba(0,0,0,0.1)',
        sm: '0 1.6px 3.6px rgba(0,0,0,0.13), 0 0.3px 0.9px rgba(0,0,0,0.1)',
        md: '0 3.2px 7.2px rgba(0,0,0,0.13), 0 0.6px 1.8px rgba(0,0,0,0.1)',
        lg: '0 6.4px 14.4px rgba(0,0,0,0.13), 0 1.2px 3.6px rgba(0,0,0,0.11)',
        xl: '0 25.6px 57.6px rgba(0,0,0,0.22), 0 4.8px 14.4px rgba(0,0,0,0.18)',
        none: 'none',
      },
    },
  },
  plugins: [],
};
