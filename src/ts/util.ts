/**
 * @license
 * Copyright (C) piayo.
 */


export function qs<T extends HTMLElement>( query: string, context: Document|HTMLElement = document ): T|null {
    return context.querySelector( query ) || null;
}

export function qsa<T extends HTMLElement>( query: string, context: Document|HTMLElement = document ): T[] {
    return Array.from( context.querySelectorAll( query ) );
}

export function getCSSTransitionDuration( element: HTMLElement ): number {
    const duration = window.getComputedStyle(element).transitionDuration;
    const msec = (parseFloat(duration) || 0) * ( duration.endsWith("s") ? 1000 : 1 );
    return msec;
}

export function stopPropagation( event: Event ): void {
    event.stopPropagation();
    event.stopImmediatePropagation();
}

export function dispatchEvent(
    element:   HTMLElement|Document|Window,
    eventName: string,
    option:    CustomEventInit = {},
): void {
    if ( !element ) {
        return;
    }

    element.dispatchEvent(
        new CustomEvent( eventName, {
            bubbles: true,
            cancelable: true,
            composed: false,
            ...option,
        })
    );
}

export const noop = function(){ /* noop */ };

export async function delay(secTime: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(() => resolve(), secTime);
    });
}

export function debounce<T extends (...args: any[]) => unknown>( callback: T, delay = 250 ): ((...args: Parameters<T>) => void) {
    let timeoutId: any;
    return (...args) => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => callback(...args), delay)
    }
}