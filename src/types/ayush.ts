// src/types/ayush.ts
export interface AyushClinicalProfile {
  prakriti: 'Vata' | 'Pitta' | 'Kapha' | 'Vata-Pitta' | 'Pitta-Kapha' | 'Vata-Kapha' | 'Tridoshaja';
  vikriti: {
    doshaImbalance: ('Vata' | 'Pitta' | 'Kapha')[];
    severity: 'Mild' | 'Moderate' | 'Severe';
  };
  agni: 'Mandagni' | 'Tikshnagni' | 'Vishamagni' | 'Samagni';
  koshtha: 'Krura' | 'Mridu' | 'Madhyama';
  dashavidhaPariksha: {
    sara: 'Avara' | 'Madhyama' | 'Pravara';
    samhanana: 'Compact' | 'Moderate' | 'Loose';
    satmya: 'Oka-Satmya' | 'Sarva-Rasa' | 'Vyayama';
    sattva: 'Pravara' | 'Madhyama' | 'Avara';
    aharaShakti: 'High' | 'Medium' | 'Low';
    vyayamaShakti: 'High' | 'Medium' | 'Low';
    vaya: 'Balya' | 'Madhyama' | 'Vridha';
  };
  ashtavidhaPariksha: {
    jihva: 'Sama' | 'Nirama' | 'Ruksha';
    mutra: 'Normal' | 'Alpam' | 'Prabhuta' | 'Daha';
    mala: 'Vibandha' | 'Atipravritti' | 'Pichhila';
  };
  aharaViharaDetails: string;
}