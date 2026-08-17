/* Which vehicles are NOT bound to the car road network.
 *
 * A bike or an auto uses lanes and cut-throughs that Google's car graph
 * excludes. Routing them as cars made a real 1.9 km Lucknow trip come back as
 * 4.2 km instead of 2.8 km — and fare is base + per_km × distance, so that was
 * money, not just a wrong ETA.
 *
 * This list lived as a separate copy in every file that routes: the two maps,
 * the voice nav, and the in-trip "x km baaki" bar. That fourth copy never got
 * written, which is exactly why that bar kept showing the car distance after
 * everything else had been fixed. One definition now, so a vehicle cannot be
 * nimble on the map and not nimble in the voice.
 *
 * The customer app (rideapp-mobile3, src/components/LiveMap.tsx) necessarily
 * keeps its own copy — different repo. It MUST stay identical to this one: the
 * customer is quoted a fare on one road network and the driver is sent down
 * another, so a vehicle listed here but not there means the driver drives
 * further than the passenger paid for.
 */
export const NIMBLE_VEHICLES = ['bike', 'auto', 'eriksha', 'electric_auto', 'green_bike'];

export const isNimble = (vehicleType?: string | null): boolean =>
  NIMBLE_VEHICLES.includes(String(vehicleType || ''));
