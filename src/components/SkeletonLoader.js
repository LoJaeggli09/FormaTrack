import React from 'react';

const SkeletonBox = ({ width = '100%', height = 16, style = {} }) => (
  <div
    className="skeleton-box"
    style={{ width, height, ...style }}
    aria-hidden="true"
  />
);

export const SectionSkeleton = ({ rows = 4 }) => (
  <div className="skeleton-section" role="status" aria-label="Caricamento in corso...">
    <SkeletonBox width="35%" height={24} style={{ marginBottom: 24 }} />
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="skeleton-list-item">
        <SkeletonBox width="50%" height={16} style={{ marginBottom: 10 }} />
        <SkeletonBox width="35%" height={13} />
      </div>
    ))}
  </div>
);

export const CardGridSkeleton = ({ cards = 4 }) => (
  <div role="status" aria-label="Caricamento in corso...">
    <SkeletonBox width="30%" height={24} style={{ marginBottom: 24 }} />
    <div className="skeleton-card-grid">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <SkeletonBox width="70%" height={20} style={{ marginBottom: 14 }} />
          <SkeletonBox width="100%" height={13} style={{ marginBottom: 8 }} />
          <SkeletonBox width="60%" height={13} />
        </div>
      ))}
    </div>
  </div>
);

export default SectionSkeleton;
