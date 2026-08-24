// src/components/AyushIntake.tsx
import React, { useState } from 'react';
import { AyushClinicalProfile } from '../types/ayush';

interface Props {
  onComplete: (data: AyushClinicalProfile) => void;
  onBack: () => void;
}

export const AyushIntake: React.FC<Props> = ({ onComplete, onBack }) => {
  const [profile, setProfile] = useState<AyushClinicalProfile>({
    prakriti: 'Vata-Pitta',
    vikriti: { doshaImbalance: ['Vata'], severity: 'Moderate' },
    agni: 'Vishamagni',
    koshtha: 'Krura',
    dashavidhaPariksha: {
      sara: 'Madhyama',
      samhanana: 'Moderate',
      satmya: 'Sarva-Rasa',
      sattva: 'Madhyama',
      aharaShakti: 'Medium',
      vyayamaShakti: 'Medium',
      vaya: 'Madhyama',
    },
    ashtavidhaPariksha: {
      jihva: 'Sama',
      mutra: 'Normal',
      mala: 'Vibandha',
    },
    aharaViharaDetails: '',
  });

  const agniLabels: Record<AyushClinicalProfile['agni'], string> = {
    Samagni: 'Samagni (Balanced)',
    Vishamagni: 'Vishamagni (Irregular)',
    Tikshnagni: 'Tikshnagni (Sharp)',
    Mandagni: 'Mandagni (Weak)',
  };

  const koshthaLabels: Record<AyushClinicalProfile['koshtha'], string> = {
    Krura: 'Krura (Hard/Constipated)',
    Madhyama: 'Madhyama (Normal)',
    Mridu: 'Mridu (Soft/Loose)',
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 border border-emerald-100 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 border-b border-emerald-100 pb-4 mb-6">
        <span className="p-3 bg-emerald-100 text-emerald-800 rounded-xl font-bold text-lg">🌿 AYUSH</span>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">आयुर्वेदिक दशविध परीक्षा (Ayurvedic Intake)</h2>
          <p className="text-sm text-gray-500">Multimodal Prakriti, Agni & Dashavidha Clinical Profiler</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Agni */}
        <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
          <label className="block text-sm font-bold text-emerald-900 mb-2">अग्नि परीक्षा (Digestive Fire / Agni)</label>
          <div className="grid grid-cols-2 gap-2">
            {(['Samagni', 'Vishamagni', 'Tikshnagni', 'Mandagni'] as const).map((agniType) => (
              <button
                key={agniType}
                type="button"
                onClick={() => setProfile({ ...profile, agni: agniType })}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition ${
                  profile.agni === agniType
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-emerald-100/50'
                }`}
              >
                {agniLabels[agniType]}
              </button>
            ))}
          </div>
        </div>

        {/* Koshtha */}
        <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
          <label className="block text-sm font-bold text-emerald-900 mb-2">कोष्ठ परीक्षा (Bowel Habit / Koshtha)</label>
          <div className="grid grid-cols-3 gap-2">
            {(['Krura', 'Madhyama', 'Mridu'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setProfile({ ...profile, koshtha: k })}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition ${
                  profile.koshtha === k
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-emerald-100/50'
                }`}
              >
                {koshthaLabels[k]}
              </button>
            ))}
          </div>
        </div>

        {/* Jihva Pariksha */}
        <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
          <label className="block text-sm font-bold text-emerald-900 mb-2">जिह्वा परीक्षा (Tongue / Ama State)</label>
          <div className="grid grid-cols-3 gap-2">
            {(['Sama', 'Nirama', 'Ruksha'] as const).map((j) => (
              <button
                key={j}
                type="button"
                onClick={() =>
                  setProfile({
                    ...profile,
                    ashtavidhaPariksha: { ...profile.ashtavidhaPariksha, jihva: j },
                  })
                }
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition ${
                  profile.ashtavidhaPariksha.jihva === j
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                    : 'bg-white text-gray-700 border-gray-200'
                }`}
              >
                {j === 'Sama' ? 'साम (Coated)' : j === 'Nirama' ? 'निराम (Clean)' : 'रूक्ष (Dry)'}
              </button>
            ))}
          </div>
        </div>

        {/* Ahara & Vihara Lifestyle */}
        <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
          <label className="block text-sm font-bold text-emerald-900 mb-2">आहार-विहार (Diet & Daily Regimen)</label>
          <input
            type="text"
            placeholder="e.g., Spicy food, irregular sleep (Ratri Jagarana)..."
            value={profile.aharaViharaDetails}
            onChange={(e) => setProfile({ ...profile, aharaViharaDetails: e.target.value })}
            className="w-full text-sm p-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-8 flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={() => onComplete(profile)}
          className="px-8 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg shadow-emerald-600/30 transition"
        >
          Confirm AYUSH Pariksha →
        </button>
      </div>
    </div>
  );
};