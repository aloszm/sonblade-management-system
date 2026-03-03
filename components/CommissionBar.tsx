'use client';

import React from 'react';

interface CommissionBarProps {
    cuts: number;
    showLabel?: boolean;
    compact?: boolean;
    isFlat50?: boolean;
}

const tiers = [
    { min: 0, max: 25, rate: 40, label: '40%', color: 'bg-gray-400', activeColor: 'bg-gray-500' },
    { min: 26, max: 49, rate: 45, label: '45%', color: 'bg-gray-300', activeColor: 'bg-blue-500' },
    { min: 50, max: 999, rate: 50, label: '50%', color: 'bg-gray-300', activeColor: 'bg-sonblade-gold' },
];

export default function CommissionBar({ cuts, showLabel = true, compact = false, isFlat50 = false }: CommissionBarProps) {
    const currentTierIdx = tiers.findIndex(t => cuts >= t.min && cuts <= t.max);
    const activeTier = isFlat50 ? 2 : (currentTierIdx >= 0 ? currentTierIdx : 2);
    const tier = tiers[activeTier];
    const nextTier = tiers[activeTier + 1];

    const cutsInTier = cuts - tier.min;
    const tierRange = tier.max - tier.min + 1;
    const progressInTier = Math.min(cutsInTier / tierRange, 1);

    const cutsForNext = nextTier ? nextTier.min - cuts : 0;
    const isMax = isFlat50 || activeTier >= 2;

    return (
        <div className={compact ? 'space-y-1' : 'space-y-2'}>
            {/* Progress bar with 4 segments */}
            <div className="flex gap-0.5 h-3 rounded-full overflow-hidden bg-gray-200">
                {tiers.map((t, i) => {
                    const isFilled = i < activeTier;
                    const isCurrent = i === activeTier;

                    return (
                        <div
                            key={t.rate}
                            className={`relative flex-1 ${i === 0 ? 'rounded-l-full' : ''} ${i === 2 ? 'rounded-r-full' : ''} ${isFilled ? t.activeColor : 'bg-gray-200'}`}
                        >
                            {isCurrent && (
                                <div
                                    className={`absolute inset-y-0 left-0 ${t.activeColor} transition-all duration-500 ${i === 0 ? 'rounded-l-full' : ''}`}
                                    style={{ width: `${isFlat50 ? 100 : progressInTier * 100}%` }}
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Label */}
            {showLabel && (
                <p className={`${compact ? 'text-[10px]' : 'text-xs'} text-gray-500`}>
                    {isFlat50 ? (
                        <span className="text-sonblade-gold font-bold">✨ Comisión Fija — 50%</span>
                    ) : isMax ? (
                        <span className="text-sonblade-gold font-bold">✨ Nivel máximo — 50%</span>
                    ) : (
                        <span>Faltan <strong className="text-gray-900">{cutsForNext}</strong> cortes para {nextTier?.label}</span>
                    )}
                </p>
            )}
        </div>
    );
}
