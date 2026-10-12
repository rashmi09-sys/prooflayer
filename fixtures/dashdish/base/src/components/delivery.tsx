import type { Delivery } from "../lib/checkout.ts";
import { Bike } from "./icons.tsx";

/** How and when the order arrives. Revision A: delivery now only. */
export function DeliveryPicker({ eta }: { delivery: Delivery; setDelivery: (d: Delivery) => void; eta: string }) {
  return (
    <section className="dd-panel">
      <h2>
        <Bike size={16} /> Delivery
      </h2>
      <div className="dd-options">
        <span className="dd-option is-on">
          <b>Deliver now</b>
          <span className="dd-muted dd-small">{eta}</span>
        </span>
      </div>
    </section>
  );
}

export function deliveryLabel(_delivery: Delivery, eta: string): string {
  return `Arriving in ${eta}`;
}
