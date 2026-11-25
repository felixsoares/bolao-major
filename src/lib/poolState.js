export const serializePoolState = (stages, scoring) =>
  JSON.stringify(
    {
      stages: stages.map(({ teamIds: _teamIds, ...stage }) => stage),
      scoring,
    },
    (_key, value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
        : value
  );

export const officialResultsForStage = (stage) =>
  stage.type === 'playoffs'
    ? {
        champion: stage.results?.champion || null,
        finalists: [...(stage.results?.finalists || [])],
        semifinalists: [...(stage.results?.semifinalists || [])],
      }
    : {
        threeZero: [...(stage.results?.threeZero || [])],
        advance: [...(stage.results?.advance || [])],
        zeroThree: [...(stage.results?.zeroThree || [])],
      };

export const reconcileOfficialDraft = (draft, previous, next) => {
  if (
    previous?.stageId === next.stageId &&
    JSON.stringify(draft) !== JSON.stringify(previous.results)
  ) {
    return draft;
  }
  return next.results;
};

export const createPoolStateRefresher = ({
  load,
  getCurrent,
  getLastSaved,
  hasPendingSave,
  apply,
  onError,
}) => {
  let requestId = 0;
  let disposed = false;

  return {
    refresh: async () => {
      if (disposed || hasPendingSave()) return;
      const current = getCurrent();
      const snapshot = serializePoolState(current.stages, current.scoring);
      if (snapshot !== getLastSaved()) return;
      const id = ++requestId;

      try {
        const state = await load();
        const latest = getCurrent();
        if (
          disposed ||
          id !== requestId ||
          hasPendingSave() ||
          snapshot !== getLastSaved() ||
          snapshot !== serializePoolState(latest.stages, latest.scoring)
        ) return;
        apply(state);
      } catch (error) {
        if (!disposed && id === requestId) onError(error);
      }
    },
    dispose: () => {
      disposed = true;
    },
  };
};
