/**
 * Prevents Angular change detection from
 * running with certain Web Component callbacks
 */
interface CozyCraftZoneWindow extends Window {
  __Zone_disable_customElements?: boolean;
}

(window as CozyCraftZoneWindow).__Zone_disable_customElements = true;
