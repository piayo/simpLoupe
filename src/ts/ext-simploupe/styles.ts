import { css } from "lit";

export const styles = css`

[hidden] {
    display:none !important;
}
* {
    box-sizing: border-box;
}

:host {
    display: contents;
    color: #333;
    font-size: 14px;
    text-rendering: geometricPrecision;
    -webkit-font-smoothing: antialiased;

    --speed: 240ms;
    transition: display var(--speed) allow-discrete;

    @media (prefers-reduced-motion: reduce) {
        --speed: 0ms;
    }
}
:host(:not([open])) {
    display: none;
}
@starting-style {
    :host([open]) {
        display: contents;
    }
}

.dialog {
    --cursor: crosshair;
    view-transition-name: "gcz-setting";
    font-family: -apple-system, "Google Sans Text", "Google Sans", Helvetica, Arial, "Segoe UI Emoji", "Segoe UI Symbol", "Noto Emoji", sans-serif;
    color: inherit;
    pointer-events: none;

    position: fixed;
    left: 0;
    top: 0;
    width: 100dvw;
    height: 100dvh;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    background-color: transparent;

    opacity: 0;
    scale: 0.92;
    transition:
        display var(--speed) allow-discrete,
        opacity var(--speed),
        scale var(--speed);

    &::backdrop {
        pointer-events: none;
        background-color: transparent;
    }
    &[open] {
        display: block;
        opacity: 1;
        scale: 1;
    }
    @starting-style {
        &[open] {
            display: block;
            opacity: 0;
            scale: 0.96;
        }
    }
}

.loupe {
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: auto;
    background-color: rgba(255,255,255,0.5);
    cursor: var(--cursor);

    /* width: 320px;
    height: 320px; */

    &:before,
    &:after,
    .canvas,
    .parts {
        pointer-events:none;
        position: absolute;
        content: '';
        display: block;
        inset: 0;
        border-radius: inherit;
    }

    &:before {
        z-index: 1;
    }
    .canvas {
        z-index: 2;
    }
    &:after {
        z-index: 3;
    }
    .parts {
        z-index: 4;
    }

    .setting {
        position: absolute;
        z-index: 99;
        justify-content: center;
        align-items: center;
        background-color: #fff;
        color: #333;
        border: 1px solid #fff;
        font-size: 14px;
        margin-bottom: -280px;
        border-radius: 16px;
        box-shadow: 0 1px 8px rgba(0, 0, 0, 0.4);
        cursor: default;

        .header {
            background-color: #707f96;
            border-top-left-radius: inherit;
            border-top-right-radius: inherit;
            color: #fff;
            font-size: 12px;
            text-align: center;
            padding: 2px 0;

            ._version {
                opacity: .5;
                font-size: 80%;
            }
        }

        .table {
            margin: 4px 4px;
        }

        input,label {
            accent-color: #2255ff;
            cursor: pointer;
            margin: 0;
            vertical-align: middle;
        }
        th {
            text-align: right;
        }
        label {
            display: inline-flex;
            align-items: center;
            margin-right: 8px;
        }
        input[type='radio'] {
            margin: 0 2px 0 0;
        }
    }

    &[data-shape='round'] {
        border-radius: 50%;
        .canvas {
            border-radius: 50%;
        }
    }

    &[data-skin='1'] {
        background-color: transparent;
        &:before {
            box-shadow:
                0 4px 16px rgba(0, 0, 0, 0.2),
                0 1px 4px rgba(0, 0, 0, 0.2);
        }
        &:after {
            box-shadow:
                inset 0 1px 32px rgb(255,255,255, 0.06),
                inset 0 0px 1px 0px rgb(255,255,255, 0.4);
        }
    }

    &[data-skin='2'] {
        &:before {
            margin: -12px;
            border: 12px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 2px 16px rgba(0, 0, 0, 0.2);
        }
        &:after {
            border: 1px solid rgba(255,255,255,0.6);
            box-shadow:
                inset rgba(0, 0, 0, 0.2) 0px 0px 4px,
                inset rgba(0, 0, 0, 0.1) 0px 2px 12px;
        }
    }

    &[data-skin='3'] {
        &:before {
            inset: -18px;
            border: 1px solid rgba(0, 0, 0, 0.9);
            background: linear-gradient(to bottom, #939393 0%, #292929 100%);
            box-shadow:
                inset 0 1px 1px rgba(255, 255, 255, 0.5),
                inset 0 -1px 1px #000,
                0 4px 24px rgba(0, 0, 0, 0.4);
        }
        &:after {
            z-index: 1;
            inset: -8px;
            background: linear-gradient(to bottom, #777777 0%, #292929 100%);
            box-shadow: inset 0 0 3px rgba(0, 0, 0, 1);
        }
        .parts {
            inset: -1px;
            margin: 0px;
            padding: 0px;
            box-sizing: border-box;
            border: 3px solid #666;
            box-shadow:
                0 0 2px #000,
                inset 0 6px 16px -1px rgba(0, 0, 0, 0.3),
                inset 0 0 6px rgba(0, 0, 0, 0.5);
            &:after {
                -webkit-filter: blur(8px);
                filter: blur(8px);
                content: '';
                position: relative;
                display: block;
                height: 100%;
                top: 0;
                left: 0;
                margin: 6px;
                border-radius: inherit;
                background:
                    linear-gradient(180deg, rgba(255,255,255,0.12) 0%,
                    transparent  40%,
                    transparent 100%);
            }
        }
    }
}

`;
