/* Asli gaadi ki tasveerein - driver app ke liye.
 *
 * Wahi teen tasveerein jo customer app ke map par lagti hain (car, auto, bike),
 * pehle se ghumai hui - NAAK UPER. Marker 0 degree ko uttar maanta hai, to
 * naak uper na ho to gaadi ulti chalti dikhti hai.
 *
 * KYU emoji nahi:
 * Emoji har phone par apna alag roop leta hai (Samsung ka auto Pixel ke auto
 * jaisa nahi dikhta), uska koi tay naap nahi hota, aur wo GHOOM nahi sakta -
 * yaani wo ye bata hi nahi sakta ki gaadi kis taraf ja rahi hai. Isliye map par
 * uske saath ek alag teer banana padta tha.
 *
 * RANG WALA MATLAB kaise bacha:
 * Ek hi tasveer kai gaadiyon ka kaam karti hai (car/car_7/luxury sab car.png),
 * aur tasveer ka rang badla nahi ja sakta. Jo farq emoji se dikhta tha wo ab
 * ek chhote NISHAAN se aata hai - warna e-auto aur sadha auto bilkul ek jaise
 * dikhte, aur 7-seater 5-seater se alag hi na hota:
 *     green_bike / electric_auto  -> hara badge, bijli ka nishaan
 *     eriksha                     -> hara badge, patti ka nishaan
 *     car_7                       -> "7" ka badge (saat seat)
 *     luxury / ultra_luxury       -> sunehra kinara
 *
 * eriksha ke liye apni tasveer nahi hai, to wo auto ki tasveer + patti ka
 * nishaan par hai. Ye koi nayi kami nahi: app pehle bhi eriksha ko auto wale
 * hi emoji se dikhata tha aur farq isi nishaan se batata tha.
 */
import { View, Text, Image } from 'react-native';

const ART: Record<string, any> = {
  car:  require('./assets/vehicles/car.png'),
  auto: require('./assets/vehicles/auto.png'),
  bike: require('./assets/vehicles/bike.png'),
};

/* Har tasveer ka asli anupaat. Ye wahi anupaat hai jo file me hai - yahan
   isliye likha hai ki <Image> ko naap chahiye hi hota hai (bina naap ke wo
   0x0 par render hoti hai). */
const ART_SIZE: Record<string, { w: number; h: number }> = {
  car:  { w: 34, h: 72 },
  auto: { w: 30, h: 49 },
  bike: { w: 22, h: 40 },
};

type Look = { art: string; electric?: boolean; leaf?: boolean; seven?: boolean; luxury?: boolean };

const LOOK: Record<string, Look> = {
  bike:          { art: 'bike' },
  green_bike:    { art: 'bike', electric: true },
  auto:          { art: 'auto' },
  electric_auto: { art: 'auto', electric: true },
  eriksha:       { art: 'auto', leaf: true },
  car:           { art: 'car' },
  car_7:         { art: 'car', seven: true },
  luxury:        { art: 'car', luxury: true },
  ultra_luxury:  { art: 'car', luxury: true },
};

const lookOf = (vt?: string): Look => LOOK[String(vt || '').toLowerCase()] || LOOK.car;

/* Screen par kitni badi - `size` sabse lambe pehlu ka naap hai, aur doosra
   pehlu usi anupaat me nikal aata hai. Isse har gaadi apne dabbe ko bharti hai
   bina alag-alag naap tay kiye. */
function drawnSize(vt: string | undefined, size: number) {
  const s = ART_SIZE[lookOf(vt).art];
  const k = size / Math.max(s.w, s.h);
  return { w: Math.round(s.w * k), h: Math.round(s.h * k) };
}

/* Ghoomne ke baad bhi na kate, itna bada chakor dabba.
 *
 * Marker apne bachche ke DABBE jitna hi bitmap banata hai - jo bahar nikla wo
 * KAT jaata hai. Ghoomti hui cheez ka sabse bada naap uska VIKARN hota hai, to
 * utna chakor dabba lene par kisi bhi heading par kuchh bahar nikal hi nahi
 * sakta.
 *
 * Ye customer app me naapa gaya tha: wahan car har 360 ke 360 kon par katti
 * thi, sabse bura 35.6px - lagbhag aadhi gaadi. Wahi galti yahan dobara na ho.
 */
export function vehicleArtBox(vehicleType: string | undefined, size: number): number {
  const { w, h } = drawnSize(vehicleType, size);
  return Math.ceil(Math.sqrt(w * w + h * h));
}

export function VehicleArt({ vehicleType, size, onReady }: {
  vehicleType?: string;
  /* Sabse lambe pehlu ka naap. */
  size: number;
  /* Tasveer taiyar hone ki khabar - map marker ke liye. Marker ka bitmap
     ginti ke mauko par hi khinchta hai; agar wo tasveer aane se PEHLE khich
     gaya to marker khali reh jaata. */
  onReady?: () => void;
}) {
  const look = lookOf(vehicleType);
  const { w, h } = drawnSize(vehicleType, size);
  const badge = Math.max(12, Math.min(22, Math.round(size * 0.3)));
  const dot = look.electric ? '⚡' : look.leaf ? '🌿' : look.seven ? '7' : null;
  return (
    <View style={{ width: w, height: h }}>
      <Image
        source={ART[look.art]}
        style={{ width: w, height: h }}
        resizeMode="contain"
        onLoad={onReady}
      />
      {dot ? (
        <View style={{
          position: 'absolute', right: -badge * 0.28, top: -badge * 0.2,
          width: badge, height: badge, borderRadius: badge / 2,
          backgroundColor: look.seven ? '#0F172A' : '#16A34A',
          borderWidth: Math.max(1, badge * 0.09), borderColor: '#fff',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{
            fontSize: badge * (look.seven ? 0.6 : 0.55), color: '#fff',
            fontWeight: '900', lineHeight: badge * 0.82,
          }}>{dot}</Text>
        </View>
      ) : null}
      {look.luxury ? (
        <View style={{
          position: 'absolute', left: -2, right: -2, top: -2, bottom: -2,
          borderRadius: 8, borderWidth: Math.max(1.2, size * 0.035),
          borderColor: 'rgba(245,197,24,0.85)',
        }} />
      ) : null}
    </View>
  );
}
