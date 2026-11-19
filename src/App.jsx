import React, { useState, useEffect, useMemo, useRef } from 'react';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import {
  clearPicks,
  initializePool,
  loadPoolData,
  replacePicks,
  savePick,
  savePoolState,
  subscribeToPoolData,
} from './lib/poolStore';
import {
  Trophy,
  Shield,
  Users,
  Settings,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Plus,
  Trash2,
  Edit3,
  Share2,
  Download,
  Upload,
  Award,
  Search,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Flame,
  Skull,
  ArrowRightCircle,
  Eye,
  X,
  Save,
  Lock,
  Unlock,
  Crown,
  KeyRound,
  ShieldAlert,
} from 'lucide-react';

// ============================================================================
// CONFIGURAÇÕES INICIAIS (SEM DADOS FICTÍCIOS — INICIA VAZIO PARA O ADMIN)
// ============================================================================

const STORAGE_KEY = 'cs2_major_singapura_2026_v2';
const DEFAULT_ADMIN_PASSWORD = 'admin2026';

const STAGE_DEFINITIONS = [
  {
    id: 'fase-1',
    name: '1ª Fase',
    type: 'swiss',
    description: 'Formato Suíço: 2 times em 3-0, 6 times em 3-1/3-2 e 2 times em 0-3.',
  },
  {
    id: 'fase-2',
    name: '2ª Fase',
    type: 'swiss',
    description: 'Formato Suíço: 2 times em 3-0, 6 times em 3-1/3-2 e 2 times em 0-3.',
  },
  {
    id: 'fase-3',
    name: '3ª Fase',
    type: 'swiss',
    description: 'Formato Suíço: 2 times em 3-0, 6 times em 3-1/3-2 e 2 times em 0-3.',
  },
  {
    id: 'mata-mata',
    name: 'Mata-Mata',
    type: 'playoffs',
    description: 'Playoffs: defina o Grande Campeão do Major (maior pontuação do bolão) e classificados.',
  },
];

const createEmptyStages = () =>
  STAGE_DEFINITIONS.map((def) => ({
    id: def.id,
    name: def.name,
    type: def.type,
    description: def.description,
    teamIds: [],
    isLocked: false,
    results:
      def.type === 'playoffs'
        ? {
            champion: null,
            finalists: [],
            semifinalists: [],
          }
        : {
            threeZero: [],
            advance: [],
            zeroThree: [],
          },
  }));

const DEFAULT_SCORING = {
  threeZeroPoints: 3,
  advancePoints: 2,
  zeroThreePoints: 3,
  playoffSemifinalPoints: 3,
  playoffFinalistPoints: 5,
  championPoints: 12, // Maior pontuação do bolão
};

const createEmptyDraft = (stageType = 'swiss') =>
  stageType === 'playoffs'
    ? {
        champion: null,
        finalists: [],
        semifinalists: [],
      }
    : {
        threeZero: [],
        advance: [],
        zeroThree: [],
      };

// ============================================================================
// COMPONENTE DE ESCUDO / LOGO DO TIME (SVG FALLBACK ELEGANTE + IMAGEM)
// ============================================================================

const TeamBadge = ({ team, size = 'md' }) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [team?.logoUrl]);

  if (!team) return null;

  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-xs',
    lg: 'w-12 h-12 text-sm',
  }[size] || 'w-10 h-10 text-xs';

  if (team.logoUrl && !imgError) {
    return (
      <div
        className={`${sizeClasses} rounded-lg bg-slate-900/90 border border-slate-700/80 flex items-center justify-center p-1 shrink-0 overflow-hidden shadow-inner`}
      >
        <img
          src={team.logoUrl}
          alt={team.name}
          onError={() => setImgError(true)}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  const initials = team.name.slice(0, 3).toUpperCase();

  return (
    <div
      style={{
        backgroundColor: '#1e293b',
        color: '#f8fafc',
        borderColor: '#475569',
      }}
      className={`${sizeClasses} rounded-lg border flex items-center justify-center font-black tracking-tighter shrink-0 shadow-md select-none relative overflow-hidden`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/15 to-black/30 pointer-events-none" />
      <span className="relative z-10">{initials}</span>
    </div>
  );
};

// ============================================================================
// FUNÇÃO DE CÁLCULO DE PONTUAÇÃO POR FASE (SUÍÇO + MATA-MATA / CAMPEÃO)
// ============================================================================

const calculatePickScore = (pickEntry, stage, scoring) => {
  const emptyResult = {
    totalPoints: 0,
    hitsCount: 0,
    threeZeroHits: [],
    advanceHits: [],
    zeroThreeHits: [],
    championHit: false,
    finalistHits: [],
    semifinalistHits: [],
    hasOfficialResults: false,
  };

  if (!stage || !stage.results || !pickEntry?.picks) {
    return emptyResult;
  }

  if (stage.type === 'playoffs') {
    const officialChamp = stage.results.champion || null;
    const officialFinalists = stage.results.finalists || [];
    const officialSemis = stage.results.semifinalists || [];

    const hasOfficialResults = Boolean(
      officialChamp || officialFinalists.length > 0 || officialSemis.length > 0
    );

    const userChamp = pickEntry.picks.champion || null;
    const userFinalists = pickEntry.picks.finalists || [];
    const userSemis = pickEntry.picks.semifinalists || [];

    const championHit = Boolean(officialChamp && userChamp && officialChamp === userChamp);
    const finalistHits = userFinalists.filter((id) => officialFinalists.includes(id));
    const semifinalistHits = userSemis.filter((id) => officialSemis.includes(id));

    const hitsCount =
      (championHit ? 1 : 0) + finalistHits.length + semifinalistHits.length;

    const totalPoints =
      (championHit ? scoring.championPoints : 0) +
      finalistHits.length * scoring.playoffFinalistPoints +
      semifinalistHits.length * scoring.playoffSemifinalPoints;

    return {
      ...emptyResult,
      totalPoints,
      hitsCount,
      championHit,
      finalistHits,
      semifinalistHits,
      hasOfficialResults,
    };
  }

  // Formato Suíço (1ª, 2ª e 3ª Fase)
  const res30 = stage.results.threeZero || [];
  const resAdv = stage.results.advance || [];
  const res03 = stage.results.zeroThree || [];

  const hasOfficialResults =
    res30.length > 0 || resAdv.length > 0 || res03.length > 0;

  const threeZeroHits = (pickEntry.picks.threeZero || []).filter((id) =>
    res30.includes(id)
  );
  const advanceHits = (pickEntry.picks.advance || []).filter((id) =>
    resAdv.includes(id)
  );
  const zeroThreeHits = (pickEntry.picks.zeroThree || []).filter((id) =>
    res03.includes(id)
  );

  const hitsCount =
    threeZeroHits.length + advanceHits.length + zeroThreeHits.length;

  const totalPoints =
    threeZeroHits.length * scoring.threeZeroPoints +
    advanceHits.length * scoring.advancePoints +
    zeroThreeHits.length * scoring.zeroThreePoints;

  return {
    ...emptyResult,
    totalPoints,
    hitsCount,
    threeZeroHits,
    advanceHits,
    zeroThreeHits,
    hasOfficialResults,
  };
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function App() {
  // Estado principal compartilhado pelo Supabase.
  const [teams, setTeams] = useState([]);
  const [stages, setStages] = useState(createEmptyStages);
  const [picks, setPicks] = useState([]);
  const [scoring, setScoring] = useState(DEFAULT_SCORING);
  const [adminPassword, setAdminPassword] = useState(DEFAULT_ADMIN_PASSWORD);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const lastSavedStateRef = useRef('');
  const currentStateRef = useRef({ teams, stages, scoring });
  const skipLocalCacheRef = useRef(false);

  // Autenticação do Painel Admin
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');

  // Navegação e UI
  const [activeTab, setActiveTab] = useState('pickem'); // 'pickem' | 'ranking' | 'admin'
  const [selectedStageId, setSelectedStageId] = useState('fase-1');
  const [toast, setToast] = useState(null);

  // Estado da Aba "Fazer Palpite"
  const [playerName, setPlayerName] = useState('');
  const [draft, setDraft] = useState(() => createEmptyDraft('swiss'));
  const [activeBucket, setActiveBucket] = useState('threeZero'); // suíço: 'threeZero' | 'advance' | 'zeroThree' | playoffs: 'champion' | 'finalists' | 'semifinalists'
  const [teamSearch, setTeamSearch] = useState('');

  // Estado da Aba "Ranking"
  const [rankingFilterStage, setRankingFilterStage] = useState('all'); // 'all' ou stageId
  const [inspectingPick, setInspectingPick] = useState(null);

  // Estado da Aba "Admin"
  const [adminSubTab, setAdminSubTab] = useState('round-teams'); // 'round-teams' | 'results' | 'teams' | 'backup'
  const [adminStageId, setAdminStageId] = useState('fase-1');
  const [draftOfficialResults, setDraftOfficialResults] = useState(() =>
    createEmptyDraft('swiss')
  );

  // Admin: Cadastro/Edição de Time
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamLogo, setNewTeamLogo] = useState('');
  const [editingTeamId, setEditingTeamId] = useState(null);

  // Admin: Backup JSON
  const [backupJsonInput, setBackupJsonInput] = useState('');

  // Mostrar Toast de feedback
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3800);
  };

  useEffect(() => {
    currentStateRef.current = { teams, stages, scoring };
  }, [teams, stages, scoring]);

  // Carrega os dados compartilhados e migra a cópia local na primeira conexão.
  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!isSupabaseConfigured) {
        setConnectionError(
          'Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY para conectar o banco.'
        );
        setIsLoaded(true);
        return;
      }

      try {
        let legacyData = null;
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            legacyData = JSON.parse(saved);
          } catch (error) {
            console.error('Erro ao ler os dados locais antigos:', error);
          }
        }

        let remoteData = await loadPoolData();
        const hasLegacyPoolData =
          (Array.isArray(legacyData?.teams) && legacyData.teams.length > 0) ||
          (Array.isArray(legacyData?.stages) &&
            legacyData.stages.some(
              (stage) =>
                stage.isLocked ||
                stage.teamIds?.length ||
                stage.results?.threeZero?.length ||
                stage.results?.advance?.length ||
                stage.results?.zeroThree?.length ||
                stage.results?.champion ||
                stage.results?.finalists?.length ||
                stage.results?.semifinalists?.length
            )) ||
          Object.entries(DEFAULT_SCORING).some(
            ([key, value]) => legacyData?.scoring?.[key] !== undefined && legacyData.scoring[key] !== value
          );

        if (!remoteData.state.initialized && hasLegacyPoolData) {
          const legacyStages =
            Array.isArray(legacyData?.stages) && legacyData.stages.length > 0
              ? STAGE_DEFINITIONS.map((definition) => {
                  const existing = legacyData.stages.find(
                    (stage) => stage.id === definition.id
                  );
                  return existing
                    ? {
                        ...definition,
                        ...existing,
                        type: definition.type,
                        name: definition.name,
                        results:
                          definition.type === 'playoffs'
                            ? {
                                champion: existing.results?.champion || null,
                                finalists: existing.results?.finalists || [],
                                semifinalists: existing.results?.semifinalists || [],
                              }
                            : {
                                threeZero: existing.results?.threeZero || [],
                                advance: existing.results?.advance || [],
                                zeroThree: existing.results?.zeroThree || [],
                              },
                      }
                    : createEmptyStages().find((stage) => stage.id === definition.id);
                })
              : remoteData.state.stages;

          await initializePool({
            teams: Array.isArray(legacyData?.teams)
              ? legacyData.teams
              : remoteData.state.teams,
            stages: legacyStages,
            scoring: legacyData?.scoring
              ? { ...DEFAULT_SCORING, ...legacyData.scoring }
              : remoteData.state.scoring,
            picks: Array.isArray(legacyData?.picks) ? legacyData.picks : [],
          });
          remoteData = await loadPoolData();
        }

        if (!active) return;
        setTeams(remoteData.state.teams);
        setStages(remoteData.state.stages);
        setPicks(remoteData.picks);
        setScoring({ ...DEFAULT_SCORING, ...remoteData.state.scoring });
        if (
          typeof legacyData?.adminPassword === 'string' &&
          legacyData.adminPassword.length > 0
        ) {
          setAdminPassword(legacyData.adminPassword);
        }
        lastSavedStateRef.current = JSON.stringify({
          teams: remoteData.state.teams,
          stages: remoteData.state.stages,
          scoring: remoteData.state.scoring,
        });
        setIsConnected(true);
        setConnectionError('');
      } catch (error) {
        console.error('Erro ao carregar dados do Supabase:', error);
        if (active) {
          setConnectionError(`Não foi possível carregar os dados do Supabase: ${error.message}`);
        }
      } finally {
        if (active) setIsLoaded(true);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  // Mantém equipes, fases e pontuação sincronizadas entre os participantes.
  useEffect(() => {
    if (!isLoaded || !isConnected || !supabase) return;

    const state = { teams, stages, scoring };
    const serialized = JSON.stringify(state);
    if (serialized === lastSavedStateRef.current) return;

    const timeout = setTimeout(async () => {
      try {
        await savePoolState(state);
        lastSavedStateRef.current = serialized;
        setConnectionError('');
      } catch (error) {
        console.error('Erro ao salvar dados no Supabase:', error);
        setConnectionError(`Não foi possível salvar as alterações: ${error.message}`);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [teams, stages, scoring, isLoaded, isConnected]);

  // Mantém os dados locais como backup e a senha apenas neste navegador.
  useEffect(() => {
    if (!isLoaded || !isConnected) return;
    if (skipLocalCacheRef.current) {
      skipLocalCacheRef.current = false;
      return;
    }
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ teams, stages, picks, scoring, adminPassword })
      );
    } catch (error) {
      console.error('Erro ao salvar cópia local:', error);
    }
  }, [teams, stages, picks, scoring, adminPassword, isLoaded, isConnected]);

  // Atualiza as telas abertas quando outro visitante altera os dados.
  useEffect(() => {
    if (!isLoaded || !isConnected || !supabase) return undefined;

    return subscribeToPoolData({
      onState: (state) => {
        if (!state) return;
        const serialized = JSON.stringify({
          teams: state.teams,
          stages: state.stages,
          scoring: state.scoring,
        });
        if (serialized === JSON.stringify(currentStateRef.current)) return;

        lastSavedStateRef.current = serialized;
        setTeams(state.teams);
        setStages(state.stages);
        setScoring({ ...DEFAULT_SCORING, ...state.scoring });
      },
      onPick: ({ eventType, pick, oldId }) => {
        if (eventType === 'DELETE') {
          setPicks((previous) => previous.filter((item) => item.id !== oldId));
          return;
        }
        if (!pick) return;
        setPicks((previous) => {
          const existingIndex = previous.findIndex(
            (item) =>
              item.id === pick.id ||
              (item.stageId === pick.stageId &&
                item.userName.toLowerCase() === pick.userName.toLowerCase())
          );
          const next = [...previous];
          if (existingIndex >= 0) next.splice(existingIndex, 1);
          return [pick, ...next].sort(
            (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
          );
        });
      },
    });
  }, [isLoaded, isConnected]);

  // Mapa rápido de times por ID
  const teamsMap = useMemo(() => {
    const map = {};
    teams.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [teams]);

  // Fase ativa do usuário
  const currentStage = useMemo(() => {
    return stages.find((s) => s.id === selectedStageId) || stages[0];
  }, [stages, selectedStageId]);

  // Fase ativa do admin
  const adminStage = useMemo(() => {
    return stages.find((s) => s.id === adminStageId) || stages[0];
  }, [stages, adminStageId]);

  // Sincronizar rascunho de resultado oficial quando mudar a fase no Admin
  useEffect(() => {
    if (!adminStage) return;
    if (adminStage.type === 'playoffs') {
      setDraftOfficialResults({
        champion: adminStage.results?.champion || null,
        finalists: [...(adminStage.results?.finalists || [])],
        semifinalists: [...(adminStage.results?.semifinalists || [])],
      });
    } else {
      setDraftOfficialResults({
        threeZero: [...(adminStage.results?.threeZero || [])],
        advance: [...(adminStage.results?.advance || [])],
        zeroThree: [...(adminStage.results?.zeroThree || [])],
      });
    }
  }, [adminStage]);

  // Times cadastrados pelo admin na fase atual do usuário
  const stageTeams = useMemo(() => {
    if (!currentStage) return [];
    return (currentStage.teamIds || [])
      .map((id) => teamsMap[id])
      .filter(Boolean);
  }, [currentStage, teamsMap]);

  // Times cadastrados pelo admin na fase selecionada no Admin
  const adminStageTeams = useMemo(() => {
    if (!adminStage) return [];
    return (adminStage.teamIds || [])
      .map((id) => teamsMap[id])
      .filter(Boolean);
  }, [adminStage, teamsMap]);

  // Filtragem de times na busca do usuário
  const filteredStageTeams = useMemo(() => {
    if (!teamSearch.trim()) return stageTeams;
    const q = teamSearch.toLowerCase();
    return stageTeams.filter((t) => t.name.toLowerCase().includes(q));
  }, [stageTeams, teamSearch]);

  // Carregar palpite existente do usuário ao trocar de fase ou digitar/selecionar nick
  const syncUserDraftForStage = (stageObj, nickValue) => {
    const isPlayoffs = stageObj?.type === 'playoffs';
    const cleanNick = (nickValue || '').trim().toLowerCase();

    if (!cleanNick || !stageObj) {
      setDraft(createEmptyDraft(isPlayoffs ? 'playoffs' : 'swiss'));
      setActiveBucket(isPlayoffs ? 'champion' : 'threeZero');
      return;
    }

    const existing = picks.find(
      (p) =>
        p.stageId === stageObj.id &&
        p.userName.toLowerCase() === cleanNick
    );

    if (existing && existing.picks) {
      if (isPlayoffs) {
        setDraft({
          champion: existing.picks.champion || null,
          finalists: [...(existing.picks.finalists || [])],
          semifinalists: [...(existing.picks.semifinalists || [])],
        });
      } else {
        setDraft({
          threeZero: [...(existing.picks.threeZero || [])],
          advance: [...(existing.picks.advance || [])],
          zeroThree: [...(existing.picks.zeroThree || [])],
        });
      }
    } else {
      setDraft(createEmptyDraft(isPlayoffs ? 'playoffs' : 'swiss'));
    }

    setActiveBucket(isPlayoffs ? 'champion' : 'threeZero');
  };

  useEffect(() => {
    syncUserDraftForStage(currentStage, playerName);
  }, [selectedStageId]);

  const handlePlayerNameChange = (value) => {
    setPlayerName(value);
    const clean = value.trim().toLowerCase();
    if (!clean || !currentStage) return;
    const match = picks.find(
      (p) => p.stageId === currentStage.id && p.userName.toLowerCase() === clean
    );
    if (match) {
      syncUserDraftForStage(currentStage, value);
    }
  };

  // ============================================================================
  // AUTENTICAÇÃO DO ADMIN
  // ============================================================================

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (!isConnected) {
      setPasswordError('Não foi possível conectar ao banco de dados.');
      return;
    }
    if (passwordInput === adminPassword) {
      setIsAdminAuthenticated(true);
      setPasswordInput('');
      setPasswordError('');
      showToast('Acesso administrativo liberado!');
    } else {
      setPasswordError('Senha incorreta. Tente novamente.');
    }
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    showToast('Sessão administrativa bloqueada.');
  };

  const handleChangeAdminPassword = (e) => {
    e.preventDefault();
    if (!isAdminAuthenticated || !isConnected) return;
    const trimmed = newPasswordInput.trim();
    if (trimmed.length < 4) {
      showToast('A nova senha deve ter pelo menos 4 caracteres.', 'error');
      return;
    }
    setAdminPassword(trimmed);
    setNewPasswordInput('');
    showToast('Senha do administrador alterada com sucesso!');
  };

  // ============================================================================
  // HANDLERS DO PICK'EM DO USUÁRIO
  // ============================================================================

  const getTeamDraftLocation = (teamId) => {
    if (!currentStage) return null;
    if (currentStage.type === 'playoffs') {
      if (draft.champion === teamId) return 'champion';
      if ((draft.finalists || []).includes(teamId)) return 'finalists';
      if ((draft.semifinalists || []).includes(teamId)) return 'semifinalists';
      return null;
    }
    if ((draft.threeZero || []).includes(teamId)) return 'threeZero';
    if ((draft.advance || []).includes(teamId)) return 'advance';
    if ((draft.zeroThree || []).includes(teamId)) return 'zeroThree';
    return null;
  };

  const handleToggleTeamInDraft = (teamId) => {
    if (!currentStage) return;
    if (currentStage.isLocked) {
      showToast(
        `A fase "${currentStage.name}" já foi encerrada/apurada pelo administrador.`,
        'error'
      );
      return;
    }

    const loc = getTeamDraftLocation(teamId);

    // Se já está escolhido em algum slot, remove
    if (loc) {
      if (currentStage.type === 'playoffs') {
        if (loc === 'champion') {
          setDraft((prev) => ({ ...prev, champion: null }));
        } else if (loc === 'finalists') {
          setDraft((prev) => ({
            ...prev,
            finalists: prev.finalists.filter((id) => id !== teamId),
          }));
        } else if (loc === 'semifinalists') {
          setDraft((prev) => ({
            ...prev,
            semifinalists: prev.semifinalists.filter((id) => id !== teamId),
          }));
        }
      } else {
        if (loc === 'threeZero') {
          setDraft((prev) => ({
            ...prev,
            threeZero: prev.threeZero.filter((id) => id !== teamId),
          }));
        } else if (loc === 'advance') {
          setDraft((prev) => ({
            ...prev,
            advance: prev.advance.filter((id) => id !== teamId),
          }));
        } else if (loc === 'zeroThree') {
          setDraft((prev) => ({
            ...prev,
            zeroThree: prev.zeroThree.filter((id) => id !== teamId),
          }));
        }
      }
      return;
    }

    // Inserção nas regras do Mata-Mata
    if (currentStage.type === 'playoffs') {
      if (activeBucket === 'champion') {
        setDraft((prev) => ({ ...prev, champion: teamId }));
        return;
      }
      if (activeBucket === 'finalists') {
        if ((draft.finalists || []).length >= 2) {
          showToast('Máximo de 2 finalistas selecionados.', 'error');
          return;
        }
        setDraft((prev) => ({
          ...prev,
          finalists: [...(prev.finalists || []), teamId],
        }));
        return;
      }
      if (activeBucket === 'semifinalists') {
        if ((draft.semifinalists || []).length >= 4) {
          showToast('Máximo de 4 semifinalistas selecionados.', 'error');
          return;
        }
        setDraft((prev) => ({
          ...prev,
          semifinalists: [...(prev.semifinalists || []), teamId],
        }));
        return;
      }
      // Fallback para campeão
      setDraft((prev) => ({ ...prev, champion: teamId }));
      return;
    }

    // Inserção nas regras do Formato Suíço (2x 3-0, 6x 3-1/3-2, 2x 0-3)
    if (activeBucket === 'threeZero') {
      if ((draft.threeZero || []).length < 2) {
        const next = [...(draft.threeZero || []), teamId];
        setDraft((prev) => ({ ...prev, threeZero: next }));
        if (next.length === 2 && (draft.advance || []).length < 6) {
          setActiveBucket('advance');
        }
        return;
      }
    }

    if (activeBucket === 'advance') {
      if ((draft.advance || []).length < 6) {
        const next = [...(draft.advance || []), teamId];
        setDraft((prev) => ({ ...prev, advance: next }));
        if (next.length === 6 && (draft.zeroThree || []).length < 2) {
          setActiveBucket('zeroThree');
        }
        return;
      }
    }

    if (activeBucket === 'zeroThree') {
      if ((draft.zeroThree || []).length < 2) {
        setDraft((prev) => ({
          ...prev,
          zeroThree: [...(prev.zeroThree || []), teamId],
        }));
        return;
      }
    }

    if ((draft.threeZero || []).length < 2) {
      setDraft((prev) => ({
        ...prev,
        threeZero: [...(prev.threeZero || []), teamId],
      }));
      setActiveBucket('threeZero');
    } else if ((draft.advance || []).length < 6) {
      setDraft((prev) => ({
        ...prev,
        advance: [...(prev.advance || []), teamId],
      }));
      setActiveBucket('advance');
    } else if ((draft.zeroThree || []).length < 2) {
      setDraft((prev) => ({
        ...prev,
        zeroThree: [...(prev.zeroThree || []), teamId],
      }));
      setActiveBucket('zeroThree');
    } else {
      showToast(
        'Todos os 10 slots já foram preenchidos! Remova um time antes de adicionar outro.',
        'error'
      );
    }
  };

  const handleSaveUserPick = async () => {
    if (!isConnected) {
      showToast('Não foi possível conectar ao banco de dados.', 'error');
      return;
    }

    const cleanName = playerName.trim();
    if (!cleanName) {
      showToast('Digite seu apelido/nick antes de salvar o palpite.', 'error');
      return;
    }

    if (!currentStage) return;

    if (currentStage.isLocked) {
      showToast(
        `A fase "${currentStage.name}" já foi encerrada pelo administrador.`,
        'error'
      );
      return;
    }

    if (currentStage.type === 'playoffs') {
      if (!draft.champion) {
        showToast(
          'Selecione o Grande Campeão do Mata-Mata antes de salvar!',
          'error'
        );
        return;
      }
    } else {
      const c30 = (draft.threeZero || []).length;
      const cAdv = (draft.advance || []).length;
      const c03 = (draft.zeroThree || []).length;
      if (c30 !== 2 || cAdv !== 6 || c03 !== 2) {
        showToast(
          `Preencha exatamente 2 no 3-0, 6 no 3-1/3-2 e 2 no 0-3 (Atual: ${c30}/2, ${cAdv}/6, ${c03}/2).`,
          'error'
        );
        return;
      }
    }

    const now = new Date().toISOString();
    const cleanPicks =
      currentStage.type === 'playoffs'
        ? {
            champion: draft.champion,
            finalists: draft.finalists || [],
            semifinalists: draft.semifinalists || [],
          }
        : {
            threeZero: draft.threeZero || [],
            advance: draft.advance || [],
            zeroThree: draft.zeroThree || [],
          };

    const existing = picks.find(
      (pick) =>
        pick.stageId === currentStage.id &&
        pick.userName.toLowerCase() === cleanName.toLowerCase()
    );
    const pickToSave = {
      id: existing?.id || `pick-${Date.now()}`,
      userName: cleanName,
      stageId: currentStage.id,
      updatedAt: now,
      picks: cleanPicks,
    };

    try {
      const savedPick = await savePick(pickToSave);
      setPicks((previous) => {
        const remaining = previous.filter(
          (pick) =>
            pick.id !== savedPick.id &&
            !(
              pick.stageId === savedPick.stageId &&
              pick.userName.toLowerCase() === savedPick.userName.toLowerCase()
            )
        );
        return [savedPick, ...remaining];
      });
      showToast(`Palpite de "${cleanName}" salvo para ${currentStage.name}!`);
    } catch (error) {
      console.error('Erro ao salvar palpite no Supabase:', error);
      showToast(`Não foi possível salvar o palpite: ${error.message}`, 'error');
    }
  };

  // ============================================================================
  // HANDLERS DO PAINEL ADMINISTRATIVO (PROTEGIDOS POR SENHA)
  // ============================================================================

  const requireAdmin = () => {
    if (!isConnected) {
      showToast('Não foi possível conectar ao banco de dados.', 'error');
      return false;
    }
    if (!isAdminAuthenticated) {
      showToast('Acesso negado: autentique-se com a senha do administrador.', 'error');
      return false;
    }
    return true;
  };

  // 1. Cadastro / Edição / Remoção de Times
  const handleSaveTeam = (e) => {
    e.preventDefault();
    if (!requireAdmin()) return;
    const cleanName = newTeamName.trim();
    if (!cleanName) {
      showToast('Informe o nome do time.', 'error');
      return;
    }

    if (editingTeamId) {
      setTeams((prev) =>
        prev.map((t) =>
          t.id === editingTeamId
            ? {
                ...t,
                name: cleanName,
                logoUrl: newTeamLogo.trim(),
              }
            : t
        )
      );
      showToast(`Time "${cleanName}" atualizado!`);
      setEditingTeamId(null);
    } else {
      const newTeam = {
        id: `team-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        logoUrl: newTeamLogo.trim(),
      };
      setTeams((prev) => [...prev, newTeam]);
      showToast(`Time "${cleanName}" cadastrado!`);
    }

    setNewTeamName('');
    setNewTeamLogo('');
  };

  const handleStartEditTeam = (team) => {
    if (!requireAdmin()) return;
    setEditingTeamId(team.id);
    setNewTeamName(team.name);
    setNewTeamLogo(team.logoUrl || '');
  };

  const handleDeleteTeam = (teamId) => {
    if (!requireAdmin()) return;
    setTeams((prev) => prev.filter((t) => t.id !== teamId));
    setStages((prev) =>
      prev.map((st) => ({
        ...st,
        teamIds: (st.teamIds || []).filter((id) => id !== teamId),
        results:
          st.type === 'playoffs'
            ? {
                champion: st.results?.champion === teamId ? null : st.results?.champion,
                finalists: (st.results?.finalists || []).filter((id) => id !== teamId),
                semifinalists: (st.results?.semifinalists || []).filter(
                  (id) => id !== teamId
                ),
              }
            : {
                threeZero: (st.results?.threeZero || []).filter((id) => id !== teamId),
                advance: (st.results?.advance || []).filter((id) => id !== teamId),
                zeroThree: (st.results?.zeroThree || []).filter((id) => id !== teamId),
              },
      }))
    );
    showToast('Time removido.');
  };

  // 2. Definir Times de Cada Uma das 4 Rodadas
  const handleToggleTeamInStage = (stageId, teamId) => {
    if (!requireAdmin()) return;
    setStages((prev) =>
      prev.map((st) => {
        if (st.id !== stageId) return st;
        const currentIds = st.teamIds || [];
        const exists = currentIds.includes(teamId);
        return {
          ...st,
          teamIds: exists
            ? currentIds.filter((id) => id !== teamId)
            : [...currentIds, teamId],
        };
      })
    );
  };

  const handleSelectAllTeamsForStage = (stageId) => {
    if (!requireAdmin()) return;
    setStages((prev) =>
      prev.map((st) => {
        if (st.id !== stageId) return st;
        const allSelected = teams.length > 0 && st.teamIds.length === teams.length;
        return {
          ...st,
          teamIds: allSelected ? [] : teams.map((t) => t.id),
        };
      })
    );
  };

  const handleToggleStageLock = (stageId) => {
    if (!requireAdmin()) return;
    setStages((prev) =>
      prev.map((st) => (st.id === stageId ? { ...st, isLocked: !st.isLocked } : st))
    );
    showToast('Status de bloqueio de palpites da rodada atualizado.');
  };

  // 3. Apuração de Resultados Oficiais (Suíço e Mata-Mata / Campeão)
  const handleToggleDraftOfficialResult = (category, teamId) => {
    if (!requireAdmin() || !adminStage) return;

    if (adminStage.type === 'playoffs') {
      if (category === 'champion') {
        setDraftOfficialResults((prev) => ({
          ...prev,
          champion: prev.champion === teamId ? null : teamId,
        }));
        return;
      }
      if (category === 'finalists') {
        setDraftOfficialResults((prev) => {
          const list = prev.finalists || [];
          const exists = list.includes(teamId);
          if (exists) {
            return { ...prev, finalists: list.filter((id) => id !== teamId) };
          }
          if (list.length >= 2) {
            showToast('Máximo de 2 finalistas oficiais.', 'error');
            return prev;
          }
          return { ...prev, finalists: [...list, teamId] };
        });
        return;
      }
      if (category === 'semifinalists') {
        setDraftOfficialResults((prev) => {
          const list = prev.semifinalists || [];
          const exists = list.includes(teamId);
          if (exists) {
            return { ...prev, semifinalists: list.filter((id) => id !== teamId) };
          }
          if (list.length >= 4) {
            showToast('Máximo de 4 semifinalistas oficiais.', 'error');
            return prev;
          }
          return { ...prev, semifinalists: [...list, teamId] };
        });
        return;
      }
      return;
    }

    // Formato Suíço
    setDraftOfficialResults((prev) => {
      const next30 = (prev.threeZero || []).filter((id) => id !== teamId);
      const nextAdv = (prev.advance || []).filter((id) => id !== teamId);
      const next03 = (prev.zeroThree || []).filter((id) => id !== teamId);

      const wasInCategory = (prev[category] || []).includes(teamId);

      if (!wasInCategory) {
        if (category === 'threeZero') {
          if (next30.length >= 2) {
            showToast('Máximo de 2 times no 3-0 oficial.', 'error');
            return prev;
          }
          next30.push(teamId);
        } else if (category === 'advance') {
          if (nextAdv.length >= 6) {
            showToast('Máximo de 6 times no 3-1/3-2 oficial.', 'error');
            return prev;
          }
          nextAdv.push(teamId);
        } else if (category === 'zeroThree') {
          if (next03.length >= 2) {
            showToast('Máximo de 2 times no 0-3 oficial.', 'error');
            return prev;
          }
          next03.push(teamId);
        }
      }

      return {
        threeZero: next30,
        advance: nextAdv,
        zeroThree: next03,
      };
    });
  };

  const handleSaveOfficialResults = (lockStageAfterSave = true) => {
    if (!requireAdmin() || !adminStage) return;

    setStages((prev) =>
      prev.map((st) => {
        if (st.id !== adminStage.id) return st;
        return {
          ...st,
          isLocked: lockStageAfterSave ? true : st.isLocked,
          results:
            st.type === 'playoffs'
              ? {
                  champion: draftOfficialResults.champion || null,
                  finalists: draftOfficialResults.finalists || [],
                  semifinalists: draftOfficialResults.semifinalists || [],
                }
              : {
                  threeZero: draftOfficialResults.threeZero || [],
                  advance: draftOfficialResults.advance || [],
                  zeroThree: draftOfficialResults.zeroThree || [],
                },
        };
      })
    );

    showToast(
      `Resultado oficial de "${adminStage.name}" salvo! Pontuações e ranking recalculados.`
    );
  };

  // 4. Backup JSON Completo
  const handleExportBackupJson = () => {
    if (!requireAdmin()) return;
    const data = JSON.stringify(
      { teams, stages, picks, scoring },
      null,
      2
    );
    navigator.clipboard.writeText(data);
    showToast('Backup JSON completo copiado para a área de transferência!');
  };

  const handleImportBackupJson = async () => {
    if (!requireAdmin()) return;
    let parsed;
    try {
      parsed = JSON.parse(backupJsonInput);
      if (!Array.isArray(parsed.teams) || !Array.isArray(parsed.stages) || !Array.isArray(parsed.picks)) {
        throw new Error('Estrutura inválida');
      }
    } catch {
      showToast('JSON inválido. Verifique os dados colados.', 'error');
      return;
    }

    const nextScoring = parsed.scoring
      ? { ...DEFAULT_SCORING, ...parsed.scoring }
      : scoring;

    try {
      await savePoolState({
        teams: parsed.teams,
        stages: parsed.stages,
        scoring: nextScoring,
      });
      await replacePicks(parsed.picks);
      lastSavedStateRef.current = JSON.stringify({
        teams: parsed.teams,
        stages: parsed.stages,
        scoring: nextScoring,
      });
      setTeams(parsed.teams);
      setStages(parsed.stages);
      setPicks(parsed.picks);
      setScoring(nextScoring);
      if (typeof parsed.adminPassword === 'string' && parsed.adminPassword.length >= 4) {
        setAdminPassword(parsed.adminPassword);
      }
      setBackupJsonInput('');
      showToast('Backup JSON restaurado com sucesso!');
    } catch (error) {
      console.error('Erro ao restaurar backup no Supabase:', error);
      showToast(`Não foi possível restaurar o backup: ${error.message}`, 'error');
    }
  };

  const handleClearAllData = async () => {
    if (!requireAdmin()) return;
    const confirmed = window.confirm(
      'Isso apagará equipes, fases, resultados e palpites do Supabase para todos, além da cópia e da senha salvas neste navegador. A senha local voltará ao padrão. Deseja continuar?'
    );
    if (!confirmed) return;

    const emptyStages = createEmptyStages();
    try {
      await savePoolState({
        teams: [],
        stages: emptyStages,
        scoring: DEFAULT_SCORING,
      });
      await clearPicks();
    } catch (error) {
      console.error('Erro ao limpar dados do Supabase:', error);
      showToast(`Não foi possível limpar os dados: ${error.message}`, 'error');
      return;
    }

    skipLocalCacheRef.current = true;
    let localCacheCleared = true;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      localCacheCleared = false;
      console.error('Erro ao limpar a cópia local:', error);
    }

    lastSavedStateRef.current = JSON.stringify({
      teams: [],
      stages: emptyStages,
      scoring: DEFAULT_SCORING,
    });
    setTeams([]);
    setStages(emptyStages);
    setPicks([]);
    setScoring(DEFAULT_SCORING);
    setAdminPassword(DEFAULT_ADMIN_PASSWORD);
    setIsAdminAuthenticated(false);
    setPasswordInput('');
    setNewPasswordInput('');
    showToast(
      localCacheCleared
        ? 'Dados do Supabase e cópia local removidos.'
        : 'Dados do Supabase removidos, mas não foi possível limpar a cópia local.',
      localCacheCleared ? 'success' : 'error'
    );
  };

  // ============================================================================
  // CÁLCULO DO RANKING GERAL E POR FASE
  // ============================================================================

  const leaderboard = useMemo(() => {
    const userMap = {};

    picks.forEach((pickItem) => {
      if (rankingFilterStage !== 'all' && pickItem.stageId !== rankingFilterStage) {
        return;
      }

      const st = stages.find((s) => s.id === pickItem.stageId);
      const evaluation = calculatePickScore(pickItem, st, scoring);

      const key = pickItem.userName.toLowerCase();
      if (!userMap[key]) {
        userMap[key] = {
          userName: pickItem.userName,
          totalPoints: 0,
          totalHits: 0,
          championHits: 0,
          swissHits: 0,
          stageEntries: [],
        };
      }

      userMap[key].totalPoints += evaluation.totalPoints;
      userMap[key].totalHits += evaluation.hitsCount;
      if (evaluation.championHit) userMap[key].championHits += 1;
      userMap[key].swissHits +=
        (evaluation.threeZeroHits?.length || 0) +
        (evaluation.advanceHits?.length || 0) +
        (evaluation.zeroThreeHits?.length || 0);

      userMap[key].stageEntries.push({
        pick: pickItem,
        stage: st,
        evaluation,
      });
    });

    return Object.values(userMap).sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.championHits !== a.championHits) return b.championHits - a.championHits;
      return b.totalHits - a.totalHits;
    });
  }, [picks, stages, scoring, rankingFilterStage]);

  const currentStagePicks = useMemo(() => {
    if (!currentStage) return [];
    return picks.filter((p) => p.stageId === currentStage.id);
  }, [picks, currentStage]);

  // ============================================================================
  // RENDERIZAÇÃO
  // ============================================================================

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-amber-500/30 selection:text-amber-200 pb-16">
      {/* TOAST */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md ${
              toast.type === 'error'
                ? 'bg-rose-950/95 border-rose-500/60 text-rose-100'
                : 'bg-emerald-950/95 border-emerald-500/60 text-emerald-100'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            )}
            <span className="text-sm font-medium leading-snug">{toast.message}</span>
          </div>
        </div>
      )}

      {connectionError && (
        <div
          role="alert"
          className="bg-rose-950 border-b border-rose-500/50 px-4 py-3 text-center text-sm text-rose-100"
        >
          {connectionError}
        </div>
      )}

      {/* HEADER */}
      <header className="relative overflow-hidden border-b border-slate-800/80 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-5 relative z-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 p-0.5 shadow-lg shadow-amber-500/20 shrink-0">
                <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-amber-400" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    CS2 Major Championship
                  </span>
                  <span className="text-[11px] font-semibold text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded">
                    4 Fases • Campeão Vale Mais
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-1">
                  MAJOR <span className="text-amber-400">SINGAPURA 2026</span>{' '}
                  <span className="text-slate-400 font-semibold text-lg sm:text-xl">
                    | Pick&apos;Em Bolão
                  </span>
                </h1>
              </div>
            </div>

            {/* NAVEGAÇÃO PRINCIPAL */}
            <nav className="flex items-center bg-slate-900/90 p-1.5 rounded-xl border border-slate-800 self-start md:self-auto">
              <button
                onClick={() => setActiveTab('pickem')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'pickem'
                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/25'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>Fazer Palpite</span>
              </button>

              <button
                onClick={() => setActiveTab('ranking')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'ranking'
                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/25'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <Trophy className="w-4 h-4" />
                <span>Ranking</span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-md ${
                    activeTab === 'ranking'
                      ? 'bg-slate-950/20 text-slate-950'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {leaderboard.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('admin')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'admin'
                    ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/25'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                {isAdminAuthenticated ? (
                  <Unlock className="w-4 h-4" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                <span>Painel Admin</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* ================================================================== */}
        {/* ABA 1: FAZER PALPITE (USUÁRIO / PARTICIPANTE)                      */}
        {/* ================================================================== */}
        {activeTab === 'pickem' && (
          <div className="space-y-6">
            {/* Barra de Fase e Apelido */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                <div className="lg:col-span-4">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    1. Escolha a Fase (1ª a Mata-Mata)
                  </label>
                  <select
                    value={currentStage?.id || 'fase-1'}
                    onChange={(e) => setSelectedStageId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white outline-none transition"
                  >
                    {stages.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} {st.isLocked ? '— Encerrada' : '— Aberta'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    2. Seu Apelido / Nick (Sem cadastro)
                  </label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => handlePlayerNameChange(e.target.value)}
                    placeholder="Digite seu nick para criar ou alterar palpite..."
                    className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-sm font-semibold text-white placeholder:text-slate-600 outline-none transition"
                  />
                </div>

                <div className="lg:col-span-3 flex items-center gap-2">
                  <button
                    onClick={() =>
                      setDraft(createEmptyDraft(currentStage?.type || 'swiss'))
                    }
                    disabled={currentStage?.isLocked}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-sm font-semibold transition flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Limpar</span>
                  </button>
                  <button
                    onClick={handleSaveUserPick}
                    disabled={currentStage?.isLocked}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-40 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>Salvar Palpite</span>
                  </button>
                </div>
              </div>

              {/* Aviso caso a rodada já esteja encerrada pelo Admin */}
              {currentStage?.isLocked && (
                <div className="mt-4 bg-rose-950/50 border border-rose-500/40 rounded-xl px-4 py-2.5 text-xs font-semibold text-rose-200 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    Esta rodada ({currentStage.name}) foi encerrada pelo administrador. Palpites estão bloqueados para alterações.
                  </span>
                </div>
              )}

              {/* Palpites já salvos nesta fase (clique para visualizar ou alterar) */}
              {currentStagePicks.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mr-1">
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    Palpites já salvos em {currentStage?.name} (clique para ver/alterar):
                  </span>
                  {currentStagePicks.map((p) => {
                    const isSelected =
                      playerName.trim().toLowerCase() === p.userName.toLowerCase();
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setPlayerName(p.userName);
                          syncUserDraftForStage(currentStage, p.userName);
                        }}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-600 text-slate-300'
                        }`}
                      >
                        <span>{p.userName}</span>
                        <Edit3 className="w-3 h-3 opacity-70" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Estado Vazio: Admin ainda não cadastrou times nesta fase */}
            {stageTeams.length === 0 ? (
              <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl p-10 text-center space-y-2">
                <Shield className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="text-base font-bold text-slate-300">
                  Nenhum time cadastrado para a {currentStage?.name}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Acesse o <strong>Painel Admin</strong> (com a senha do administrador) para cadastrar os times e definir quais equipes participam da{' '}
                  {currentStage?.name}.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* COLUNA ESQUERDA: TIMES DISPONÍVEIS NA RODADA */}
                <div className="lg:col-span-5 bg-slate-900/70 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col">
                  <div className="mb-3">
                    <h2 className="text-base font-black text-white flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-400" />
                      <span>
                        Times da {currentStage?.name} ({stageTeams.length})
                      </span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      {currentStage?.description}
                    </p>
                  </div>

                  <div className="relative mb-3">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={teamSearch}
                      onChange={(e) => setTeamSearch(e.target.value)}
                      placeholder="Buscar time..."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/60 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-white placeholder:text-slate-600 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[540px] overflow-y-auto pr-1">
                    {filteredStageTeams.map((team) => {
                      const loc = getTeamDraftLocation(team.id);
                      const isPicked = Boolean(loc);

                      const badgeMap = {
                        threeZero: { label: '3-0', cls: 'bg-emerald-500 text-slate-950' },
                        advance: { label: '3-1/3-2', cls: 'bg-cyan-500 text-slate-950' },
                        zeroThree: { label: '0-3', cls: 'bg-rose-500 text-white' },
                        champion: { label: 'CAMPEÃO', cls: 'bg-amber-400 text-slate-950' },
                        finalists: { label: 'FINAL', cls: 'bg-purple-500 text-white' },
                        semifinalists: { label: 'SEMI', cls: 'bg-cyan-500 text-slate-950' },
                      };

                      const badge = loc ? badgeMap[loc] : null;

                      return (
                        <button
                          key={team.id}
                          onClick={() => handleToggleTeamInDraft(team.id)}
                          disabled={currentStage?.isLocked}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                            isPicked
                              ? 'bg-slate-950/60 border-slate-700 opacity-75 hover:opacity-100'
                              : 'bg-slate-950 hover:bg-slate-800/90 border-slate-800 hover:border-amber-500/50'
                          }`}
                        >
                          <TeamBadge team={team} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-white truncate">
                              {team.name}
                            </div>
                            <div className="text-[10px] font-semibold text-slate-500">
                              {isPicked ? 'Clique p/ remover' : 'Clique p/ escolher'}
                            </div>
                          </div>
                          {badge && (
                            <span
                              className={`text-[10px] font-black px-1.5 py-0.5 rounded shrink-0 ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* COLUNA DIREITA: SLOTS DE PALPITE (SUÍÇO OU MATA-MATA) */}
                <div className="lg:col-span-7 space-y-4">
                  {currentStage?.type === 'playoffs' ? (
                    <>
                      {/* CAMPEÃO DO MAJOR (MAIOR PONTUAÇÃO) */}
                      <div
                        onClick={() => setActiveBucket('champion')}
                        className={`cursor-pointer rounded-2xl p-5 border transition-all ${
                          activeBucket === 'champion'
                            ? 'bg-amber-950/30 border-amber-400 shadow-lg shadow-amber-500/10'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-400/50 flex items-center justify-center text-amber-400">
                              <Crown className="w-5 h-5" />
                            </div>
                            <div>
                              <h3 className="text-base font-black text-amber-400 flex items-center gap-2">
                                <span>Grande Campeão do Major Singapura 2026</span>
                                <span className="text-[10px] uppercase bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full font-black">
                                  +{scoring.championPoints} PTS (MAIOR PONTUAÇÃO)
                                </span>
                              </h3>
                              <p className="text-xs text-slate-400">
                                Escolha o time que levantará o troféu do Major.
                              </p>
                            </div>
                          </div>
                        </div>

                        {draft.champion && teamsMap[draft.champion] ? (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleTeamInDraft(draft.champion);
                            }}
                            className="h-16 rounded-xl bg-slate-950 border-2 border-amber-400/70 px-4 flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3">
                              <TeamBadge team={teamsMap[draft.champion]} size="md" />
                              <div>
                                <div className="text-sm font-black text-white">
                                  {teamsMap[draft.champion].name}
                                </div>
                                <div className="text-[11px] text-amber-400 font-semibold">
                                  Campeão escolhido (+{scoring.championPoints} pts)
                                </div>
                              </div>
                            </div>
                            <X className="w-4 h-4 text-slate-400 hover:text-rose-400" />
                          </div>
                        ) : (
                          <div className="h-16 rounded-xl border-2 border-dashed border-amber-500/30 bg-slate-950/40 flex items-center justify-center text-xs font-bold text-amber-300/70">
                            Clique em um time à esquerda para definir o Campeão
                          </div>
                        )}
                      </div>

                      {/* FINALISTAS (OPCIONAL / ATÉ 2 TIMES) */}
                      <div
                        onClick={() => setActiveBucket('finalists')}
                        className={`cursor-pointer rounded-2xl p-4 sm:p-5 border transition-all ${
                          activeBucket === 'finalists'
                            ? 'bg-purple-950/25 border-purple-500'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="text-sm font-black text-purple-300">
                              Finalistas (+{scoring.playoffFinalistPoints} pts cada — até 2)
                            </h3>
                            <p className="text-xs text-slate-400">
                              Opcional: marque até 2 times na Grande Final.
                            </p>
                          </div>
                          <span className="text-xs font-black text-purple-300 bg-purple-950/80 border border-purple-500/30 px-2.5 py-1 rounded-lg">
                            {(draft.finalists || []).length} / 2
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {[0, 1].map((idx) => {
                            const tid = (draft.finalists || [])[idx];
                            const t = tid ? teamsMap[tid] : null;
                            return (
                              <div
                                key={idx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveBucket('finalists');
                                  if (t) handleToggleTeamInDraft(t.id);
                                }}
                                className={`h-12 rounded-xl border-2 border-dashed flex items-center px-3 ${
                                  t
                                    ? 'bg-slate-950 border-solid border-purple-500/60 justify-between'
                                    : 'bg-slate-950/40 border-slate-800 text-slate-500 justify-center text-xs'
                                }`}
                              >
                                {t ? (
                                  <>
                                    <div className="flex items-center gap-2 min-w-0">
                                      <TeamBadge team={t} size="xs" />
                                      <span className="text-xs font-bold text-white truncate">
                                        {t.name}
                                      </span>
                                    </div>
                                    <X className="w-3.5 h-3.5 text-slate-500 hover:text-rose-400" />
                                  </>
                                ) : (
                                  <span>Finalista #{idx + 1}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* SEMIFINALISTAS (OPCIONAL / ATÉ 4 TIMES) */}
                      <div
                        onClick={() => setActiveBucket('semifinalists')}
                        className={`cursor-pointer rounded-2xl p-4 sm:p-5 border transition-all ${
                          activeBucket === 'semifinalists'
                            ? 'bg-cyan-950/25 border-cyan-500'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="text-sm font-black text-cyan-300">
                              Semifinalistas (+{scoring.playoffSemifinalPoints} pts cada — até 4)
                            </h3>
                            <p className="text-xs text-slate-400">
                              Opcional: marque até 4 times nas semifinais.
                            </p>
                          </div>
                          <span className="text-xs font-black text-cyan-300 bg-cyan-950/80 border border-cyan-500/30 px-2.5 py-1 rounded-lg">
                            {(draft.semifinalists || []).length} / 4
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {[0, 1, 2, 3].map((idx) => {
                            const tid = (draft.semifinalists || [])[idx];
                            const t = tid ? teamsMap[tid] : null;
                            return (
                              <div
                                key={idx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveBucket('semifinalists');
                                  if (t) handleToggleTeamInDraft(t.id);
                                }}
                                className={`h-12 rounded-xl border-2 border-dashed flex items-center px-3 ${
                                  t
                                    ? 'bg-slate-950 border-solid border-cyan-500/60 justify-between'
                                    : 'bg-slate-950/40 border-slate-800 text-slate-500 justify-center text-xs'
                                }`}
                              >
                                {t ? (
                                  <>
                                    <div className="flex items-center gap-2 min-w-0">
                                      <TeamBadge team={t} size="xs" />
                                      <span className="text-xs font-bold text-white truncate">
                                        {t.name}
                                      </span>
                                    </div>
                                    <X className="w-3.5 h-3.5 text-slate-500 hover:text-rose-400" />
                                  </>
                                ) : (
                                  <span>Semifinalista #{idx + 1}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* BLOCO 3-0 (2 TIMES) */}
                      <div
                        onClick={() => setActiveBucket('threeZero')}
                        className={`cursor-pointer rounded-2xl p-4 sm:p-5 border transition-all ${
                          activeBucket === 'threeZero'
                            ? 'bg-emerald-950/25 border-emerald-500 shadow-lg shadow-emerald-500/10'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                              <Flame className="w-4 h-4" />
                            </div>
                            <div>
                              <h3 className="text-sm sm:text-base font-black text-emerald-400 flex items-center gap-2">
                                <span>3-0 • Avançam Invictos</span>
                                {activeBucket === 'threeZero' && (
                                  <span className="text-[10px] uppercase bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-full font-black">
                                    Alvo Ativo
                                  </span>
                                )}
                              </h3>
                              <p className="text-xs text-slate-400">
                                2 times (+{scoring.threeZeroPoints} pts cada)
                              </p>
                            </div>
                          </div>
                          <span className="text-sm font-black text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                            {(draft.threeZero || []).length} / 2
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {[0, 1].map((slotIdx) => {
                            const teamId = (draft.threeZero || [])[slotIdx];
                            const team = teamId ? teamsMap[teamId] : null;
                            return (
                              <div
                                key={slotIdx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveBucket('threeZero');
                                  if (team) handleToggleTeamInDraft(team.id);
                                }}
                                className={`h-14 rounded-xl border-2 border-dashed flex items-center px-3 ${
                                  team
                                    ? 'bg-slate-950 border-solid border-emerald-500/60 justify-between'
                                    : 'bg-slate-950/40 border-slate-800 text-slate-500 justify-center'
                                }`}
                              >
                                {team ? (
                                  <>
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <TeamBadge team={team} size="sm" />
                                      <span className="text-sm font-bold text-white truncate">
                                        {team.name}
                                      </span>
                                    </div>
                                    <X className="w-4 h-4 text-slate-500 hover:text-rose-400" />
                                  </>
                                ) : (
                                  <span className="text-xs font-semibold">
                                    Vaga 3-0 #{slotIdx + 1}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* BLOCO 3-1 / 3-2 (6 TIMES) */}
                      <div
                        onClick={() => setActiveBucket('advance')}
                        className={`cursor-pointer rounded-2xl p-4 sm:p-5 border transition-all ${
                          activeBucket === 'advance'
                            ? 'bg-cyan-950/25 border-cyan-500 shadow-lg shadow-cyan-500/10'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                              <ArrowRightCircle className="w-4 h-4" />
                            </div>
                            <div>
                              <h3 className="text-sm sm:text-base font-black text-cyan-400 flex items-center gap-2">
                                <span>3-1 ou 3-2 • Classificados</span>
                                {activeBucket === 'advance' && (
                                  <span className="text-[10px] uppercase bg-cyan-500 text-slate-950 px-2 py-0.5 rounded-full font-black">
                                    Alvo Ativo
                                  </span>
                                )}
                              </h3>
                              <p className="text-xs text-slate-400">
                                6 times (+{scoring.advancePoints} pts cada)
                              </p>
                            </div>
                          </div>
                          <span className="text-sm font-black text-cyan-400 bg-cyan-950/80 border border-cyan-500/30 px-2.5 py-1 rounded-lg">
                            {(draft.advance || []).length} / 6
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                          {[0, 1, 2, 3, 4, 5].map((slotIdx) => {
                            const teamId = (draft.advance || [])[slotIdx];
                            const team = teamId ? teamsMap[teamId] : null;
                            return (
                              <div
                                key={slotIdx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveBucket('advance');
                                  if (team) handleToggleTeamInDraft(team.id);
                                }}
                                className={`h-14 rounded-xl border-2 border-dashed flex items-center px-2.5 ${
                                  team
                                    ? 'bg-slate-950 border-solid border-cyan-500/60 justify-between'
                                    : 'bg-slate-950/40 border-slate-800 text-slate-500 justify-center'
                                }`}
                              >
                                {team ? (
                                  <>
                                    <div className="flex items-center gap-2 min-w-0">
                                      <TeamBadge team={team} size="xs" />
                                      <span className="text-xs font-bold text-white truncate">
                                        {team.name}
                                      </span>
                                    </div>
                                    <X className="w-3.5 h-3.5 text-slate-500 hover:text-rose-400" />
                                  </>
                                ) : (
                                  <span className="text-[11px] font-semibold">
                                    Classificado #{slotIdx + 1}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* BLOCO 0-3 (2 TIMES) */}
                      <div
                        onClick={() => setActiveBucket('zeroThree')}
                        className={`cursor-pointer rounded-2xl p-4 sm:p-5 border transition-all ${
                          activeBucket === 'zeroThree'
                            ? 'bg-rose-950/25 border-rose-500 shadow-lg shadow-rose-500/10'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                              <Skull className="w-4 h-4" />
                            </div>
                            <div>
                              <h3 className="text-sm sm:text-base font-black text-rose-400 flex items-center gap-2">
                                <span>0-3 • Eliminados Sem Vencer</span>
                                {activeBucket === 'zeroThree' && (
                                  <span className="text-[10px] uppercase bg-rose-500 text-white px-2 py-0.5 rounded-full font-black">
                                    Alvo Ativo
                                  </span>
                                )}
                              </h3>
                              <p className="text-xs text-slate-400">
                                2 times (+{scoring.zeroThreePoints} pts cada)
                              </p>
                            </div>
                          </div>
                          <span className="text-sm font-black text-rose-400 bg-rose-950/80 border border-rose-500/30 px-2.5 py-1 rounded-lg">
                            {(draft.zeroThree || []).length} / 2
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {[0, 1].map((slotIdx) => {
                            const teamId = (draft.zeroThree || [])[slotIdx];
                            const team = teamId ? teamsMap[teamId] : null;
                            return (
                              <div
                                key={slotIdx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveBucket('zeroThree');
                                  if (team) handleToggleTeamInDraft(team.id);
                                }}
                                className={`h-14 rounded-xl border-2 border-dashed flex items-center px-3 ${
                                  team
                                    ? 'bg-slate-950 border-solid border-rose-500/60 justify-between'
                                    : 'bg-slate-950/40 border-slate-800 text-slate-500 justify-center'
                                }`}
                              >
                                {team ? (
                                  <>
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <TeamBadge team={team} size="sm" />
                                      <span className="text-sm font-bold text-white truncate">
                                        {team.name}
                                      </span>
                                    </div>
                                    <X className="w-4 h-4 text-slate-500 hover:text-rose-400" />
                                  </>
                                ) : (
                                  <span className="text-xs font-semibold">
                                    Vaga 0-3 #{slotIdx + 1}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================== */}
        {/* ABA 2: RANKING GERAL & POR FASE                                    */}
        {/* ================================================================== */}
        {activeTab === 'ranking' && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2.5">
                  <Award className="w-6 h-6 text-amber-400" />
                  <span>Ranking — Bolão Singapura 2026</span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Pontuação recalculada automaticamente após cada resultado oficial. Clique em um jogador para ver os detalhes.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Filtrar por Fase
                </label>
                <select
                  value={rankingFilterStage}
                  onChange={(e) => setRankingFilterStage(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold text-white outline-none focus:border-amber-500"
                >
                  <option value="all">Ranking Geral (Todas as 4 Fases)</option>
                  {stages.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Cards de Pontuação */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5">
                <div className="text-xs font-bold text-emerald-400">Acerto 3-0</div>
                <div className="text-xl font-black text-white mt-0.5">
                  +{scoring.threeZeroPoints} pts
                </div>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5">
                <div className="text-xs font-bold text-cyan-400">Acerto 3-1 / 3-2</div>
                <div className="text-xl font-black text-white mt-0.5">
                  +{scoring.advancePoints} pts
                </div>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5">
                <div className="text-xs font-bold text-rose-400">Acerto 0-3</div>
                <div className="text-xl font-black text-white mt-0.5">
                  +{scoring.zeroThreePoints} pts
                </div>
              </div>
              <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3.5">
                <div className="text-xs font-black text-amber-400 flex items-center gap-1">
                  <Crown className="w-3.5 h-3.5" />
                  <span>Campeão Mata-Mata</span>
                </div>
                <div className="text-xl font-black text-amber-300 mt-0.5">
                  +{scoring.championPoints} pts (Maior)
                </div>
              </div>
            </div>

            {/* Tabela de Classificação */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              {leaderboard.length === 0 ? (
                <div className="p-10 text-center text-slate-400 text-sm">
                  Nenhum palpite cadastrado ainda. Vá em <strong>Fazer Palpite</strong> para registrar o primeiro.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-950/90 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        <th className="py-3.5 px-4 w-16 text-center">Pos</th>
                        <th className="py-3.5 px-4">Participante</th>
                        <th className="py-3.5 px-4 text-center">Campeão</th>
                        <th className="py-3.5 px-4 text-center">Acertos</th>
                        <th className="py-3.5 px-4 text-right">Pontuação</th>
                        <th className="py-3.5 px-4 text-center w-28">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 text-sm">
                      {leaderboard.map((row, index) => (
                        <tr
                          key={row.userName}
                          onClick={() => setInspectingPick(row)}
                          className="hover:bg-slate-800/60 cursor-pointer transition-colors group"
                        >
                          <td className="py-3.5 px-4 text-center font-black">
                            {index === 0 ? (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-slate-950">
                                1º
                              </span>
                            ) : index === 1 ? (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-300 text-slate-950">
                                2º
                              </span>
                            ) : index === 2 ? (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-700 text-white">
                                3º
                              </span>
                            ) : (
                              <span className="text-slate-400">{index + 1}º</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-white group-hover:text-amber-400 transition-colors">
                              {row.userName}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {row.stageEntries.length} fase(s) enviada(s)
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center font-bold text-amber-400">
                            {row.championHits > 0 ? 'Acertou' : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 font-bold text-xs">
                              {row.totalHits}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span className="text-base font-black text-amber-400">
                              {row.totalPoints}
                            </span>{' '}
                            <span className="text-xs text-slate-500">pts</span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button className="inline-flex items-center gap-1 text-xs font-bold text-cyan-400 bg-cyan-950/50 border border-cyan-500/30 px-2.5 py-1 rounded-lg">
                              <Eye className="w-3.5 h-3.5" />
                              <span>Ver Picks</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* ABA 3: PAINEL ADMINISTRATIVO PROTEGIDO POR SENHA                   */}
        {/* ================================================================== */}
        {activeTab === 'admin' && (
          <div className="space-y-6">
            {!isAdminAuthenticated ? (
              <div className="max-w-md mx-auto bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white">
                      Painel do Administrador
                    </h2>
                    <p className="text-xs text-slate-400">
                      Digite a senha do painel para exibir os controles. O banco está configurado para permitir alterações públicas.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Senha do Administrador
                    </label>
                    <input
                      type="password"
                      value={passwordInput}
                      onChange={(e) => {
                        setPasswordInput(e.target.value);
                        setPasswordError('');
                      }}
                      placeholder="Digite a senha do admin..."
                      className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-2.5 text-sm font-semibold text-white outline-none"
                    />
                    {passwordError && (
                      <p className="text-xs text-rose-400 font-semibold mt-1.5 flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>{passwordError}</span>
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-sm transition flex items-center justify-center gap-2"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>Entrar no Painel Admin</span>
                  </button>
                </form>
              </div>
            ) : (
              <>
                {/* Barra superior do Admin autenticado */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setAdminSubTab('round-teams')}
                      className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                        adminSubTab === 'round-teams'
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      <span>Times por Rodada (4 Fases)</span>
                    </button>

                    <button
                      onClick={() => setAdminSubTab('results')}
                      className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                        adminSubTab === 'results'
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Resultados Oficiais &amp; Campeão</span>
                    </button>

                    <button
                      onClick={() => setAdminSubTab('teams')}
                      className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                        adminSubTab === 'teams'
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <Shield className="w-4 h-4" />
                      <span>Cadastrar Times ({teams.length})</span>
                    </button>

                    <button
                      onClick={() => setAdminSubTab('backup')}
                      className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                        adminSubTab === 'backup'
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>Senha &amp; Backup JSON</span>
                    </button>
                  </div>

                  <button
                    onClick={handleAdminLogout}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-300 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Bloquear Admin</span>
                  </button>
                </div>

                {/* SUB-ABA 1: DEFINIR TIMES DE CADA UMA DAS 4 RODADAS */}
                {adminSubTab === 'round-teams' && (
                  <div className="space-y-4">
                    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-black text-white">
                          Times Participantes por Rodada
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Escolha quais times cadastrados disputam a 1ª Fase, 2ª Fase, 3ª Fase e Mata-Mata.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {stages.map((st) => (
                          <button
                            key={st.id}
                            onClick={() => setAdminStageId(st.id)}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black border transition ${
                              adminStageId === st.id
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                            }`}
                          >
                            {st.name} ({st.teamIds.length})
                          </button>
                        ))}
                      </div>
                    </div>

                    {adminStage && (
                      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                          <div>
                            <h3 className="text-base font-black text-cyan-400">
                              {adminStage.name} — {adminStage.teamIds.length} times selecionados
                            </h3>
                            <p className="text-xs text-slate-400">{adminStage.description}</p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleStageLock(adminStage.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${
                                adminStage.isLocked
                                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                                  : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                              }`}
                            >
                              {adminStage.isLocked ? (
                                <>
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>Rodada Encerrada (Reabrir)</span>
                                </>
                              ) : (
                                <>
                                  <Unlock className="w-3.5 h-3.5" />
                                  <span>Rodada Aberta (Encerrar)</span>
                                </>
                              )}
                            </button>

                            {teams.length > 0 && (
                              <button
                                onClick={() => handleSelectAllTeamsForStage(adminStage.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300"
                              >
                                {adminStage.teamIds.length === teams.length
                                  ? 'Desmarcar Todos'
                                  : 'Selecionar Todos'}
                              </button>
                            )}
                          </div>
                        </div>

                        {teams.length === 0 ? (
                          <p className="text-xs text-slate-400 py-6 text-center">
                            Nenhum time cadastrado ainda. Vá na aba <strong>Cadastrar Times</strong> para adicionar equipes.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                            {teams.map((t) => {
                              const active = (adminStage.teamIds || []).includes(t.id);
                              return (
                                <button
                                  key={t.id}
                                  onClick={() => handleToggleTeamInStage(adminStage.id, t.id)}
                                  className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-left transition ${
                                    active
                                      ? 'bg-cyan-950/30 border-cyan-500 text-white'
                                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <TeamBadge team={t} size="sm" />
                                    <span className="text-xs font-bold truncate">
                                      {t.name}
                                    </span>
                                  </div>
                                  <span
                                    className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                                      active
                                        ? 'bg-cyan-500 text-slate-950'
                                        : 'bg-slate-900 text-slate-500'
                                    }`}
                                  >
                                    {active ? 'NA FASE' : 'OFF'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* SUB-ABA 2: RESULTADOS OFICIAIS & CAMPEÃO DO MATA-MATA */}
                {adminSubTab === 'results' && (
                  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                      <div>
                        <h2 className="text-lg font-black text-white">
                          Registrar Resultados Oficiais da Rodada
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Ao salvar, as pontuações de todos os usuários e o ranking são recalculados automaticamente.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {stages.map((st) => (
                          <button
                            key={st.id}
                            onClick={() => setAdminStageId(st.id)}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black border transition ${
                              adminStageId === st.id
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                            }`}
                          >
                            {st.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {adminStage && (
                      <>
                        {/* Resumo do Resultado Oficial em Edição */}
                        {adminStage.type === 'playoffs' ? (
                          <div className="bg-amber-950/25 border border-amber-500/40 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-black uppercase text-amber-400">
                                Grande Campeão Oficial ({adminStage.name})
                              </div>
                              <div className="text-base font-black text-white mt-0.5">
                                {draftOfficialResults.champion &&
                                teamsMap[draftOfficialResults.champion]
                                  ? teamsMap[draftOfficialResults.champion].name
                                  : 'Nenhum campeão selecionado'}
                              </div>
                            </div>
                            <div className="text-xs text-slate-300">
                              Finalistas: {(draftOfficialResults.finalists || []).length}/2 •
                              Semifinalistas: {(draftOfficialResults.semifinalists || []).length}/4
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3">
                              <div className="text-xs font-black text-emerald-400 flex justify-between">
                                <span>OFICIAL 3-0</span>
                                <span>{(draftOfficialResults.threeZero || []).length} / 2</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {(draftOfficialResults.threeZero || []).length === 0 ? (
                                  <span className="text-xs text-slate-500">Nenhum</span>
                                ) : (
                                  draftOfficialResults.threeZero.map((id) => (
                                    <span
                                      key={id}
                                      className="text-xs font-bold bg-emerald-500 text-slate-950 px-2 py-0.5 rounded"
                                    >
                                      {teamsMap[id]?.name}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>

                            <div className="bg-cyan-950/30 border border-cyan-500/30 rounded-xl p-3">
                              <div className="text-xs font-black text-cyan-400 flex justify-between">
                                <span>OFICIAL 3-1 / 3-2</span>
                                <span>{(draftOfficialResults.advance || []).length} / 6</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {(draftOfficialResults.advance || []).length === 0 ? (
                                  <span className="text-xs text-slate-500">Nenhum</span>
                                ) : (
                                  draftOfficialResults.advance.map((id) => (
                                    <span
                                      key={id}
                                      className="text-xs font-bold bg-cyan-500 text-slate-950 px-2 py-0.5 rounded"
                                    >
                                      {teamsMap[id]?.name}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>

                            <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-3">
                              <div className="text-xs font-black text-rose-400 flex justify-between">
                                <span>OFICIAL 0-3</span>
                                <span>{(draftOfficialResults.zeroThree || []).length} / 2</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {(draftOfficialResults.zeroThree || []).length === 0 ? (
                                  <span className="text-xs text-slate-500">Nenhum</span>
                                ) : (
                                  draftOfficialResults.zeroThree.map((id) => (
                                    <span
                                      key={id}
                                      className="text-xs font-bold bg-rose-500 text-white px-2 py-0.5 rounded"
                                    >
                                      {teamsMap[id]?.name}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Lista de Times para Marcar Resultado Oficial */}
                        {adminStageTeams.length === 0 ? (
                          <p className="text-xs text-slate-400 py-6 text-center">
                            Cadastre e selecione os times desta rodada em <strong>Times por Rodada</strong> primeiro.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {adminStageTeams.map((team) => {
                              if (adminStage.type === 'playoffs') {
                                const isChamp = draftOfficialResults.champion === team.id;
                                const isFin = (draftOfficialResults.finalists || []).includes(
                                  team.id
                                );
                                const isSemi = (
                                  draftOfficialResults.semifinalists || []
                                ).includes(team.id);

                                return (
                                  <div
                                    key={team.id}
                                    className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-xl p-3"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <TeamBadge team={team} size="sm" />
                                      <span className="text-sm font-bold text-white truncate">
                                        {team.name}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        onClick={() =>
                                          handleToggleDraftOfficialResult('champion', team.id)
                                        }
                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition ${
                                          isChamp
                                            ? 'bg-amber-400 text-slate-950'
                                            : 'bg-slate-900 text-slate-400 hover:text-amber-400 border border-slate-800'
                                        }`}
                                      >
                                        CAMPEÃO
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleToggleDraftOfficialResult('finalists', team.id)
                                        }
                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition ${
                                          isFin
                                            ? 'bg-purple-500 text-white'
                                            : 'bg-slate-900 text-slate-400 hover:text-purple-300 border border-slate-800'
                                        }`}
                                      >
                                        FINAL
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleToggleDraftOfficialResult(
                                            'semifinalists',
                                            team.id
                                          )
                                        }
                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition ${
                                          isSemi
                                            ? 'bg-cyan-500 text-slate-950'
                                            : 'bg-slate-900 text-slate-400 hover:text-cyan-300 border border-slate-800'
                                        }`}
                                      >
                                        SEMI
                                      </button>
                                    </div>
                                  </div>
                                );
                              }

                              const is30 = (draftOfficialResults.threeZero || []).includes(
                                team.id
                              );
                              const isAdv = (draftOfficialResults.advance || []).includes(
                                team.id
                              );
                              const is03 = (draftOfficialResults.zeroThree || []).includes(
                                team.id
                              );

                              return (
                                <div
                                  key={team.id}
                                  className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-xl p-3"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <TeamBadge team={team} size="sm" />
                                    <span className="text-sm font-bold text-white truncate">
                                      {team.name}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      onClick={() =>
                                        handleToggleDraftOfficialResult('threeZero', team.id)
                                      }
                                      className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition ${
                                        is30
                                          ? 'bg-emerald-500 text-slate-950'
                                          : 'bg-slate-900 text-slate-400 hover:text-emerald-400 border border-slate-800'
                                      }`}
                                    >
                                      3-0
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleToggleDraftOfficialResult('advance', team.id)
                                      }
                                      className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition ${
                                        isAdv
                                          ? 'bg-cyan-500 text-slate-950'
                                          : 'bg-slate-900 text-slate-400 hover:text-cyan-400 border border-slate-800'
                                      }`}
                                    >
                                      3-1/3-2
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleToggleDraftOfficialResult('zeroThree', team.id)
                                      }
                                      className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition ${
                                        is03
                                          ? 'bg-rose-500 text-white'
                                          : 'bg-slate-900 text-slate-400 hover:text-rose-400 border border-slate-800'
                                      }`}
                                    >
                                      0-3
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-end gap-3">
                          <button
                            onClick={() => handleSaveOfficialResults(false)}
                            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm"
                          >
                            Salvar Resultado (Manter Rodada Aberta)
                          </button>
                          <button
                            onClick={() => handleSaveOfficialResults(true)}
                            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Salvar Resultado Oficial &amp; Encerrar Rodada</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* SUB-ABA 3: CADASTRO DE TIMES (NOME, SIGLA E LOGO) */}
                {adminSubTab === 'teams' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <form
                      onSubmit={handleSaveTeam}
                      className="lg:col-span-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 self-start"
                    >
                      <h3 className="text-base font-black text-white">
                        {editingTeamId ? 'Editar Time' : 'Cadastrar Novo Time'}
                      </h3>

                      <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">
                          Nome do Time *
                        </label>
                        <input
                          type="text"
                          value={newTeamName}
                          onChange={(e) => setNewTeamName(e.target.value)}
                          placeholder="Ex: FURIA, NAVI, Vitality..."
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white outline-none focus:border-cyan-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">
                          URL da Logo (Imagem PNG/SVG)
                        </label>
                        <input
                          type="url"
                          value={newTeamLogo}
                          onChange={(e) => setNewTeamLogo(e.target.value)}
                          placeholder="https://..."
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-500"
                        />
                      </div>

                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
                        <TeamBadge
                          team={{
                            name: newTeamName || 'Time',
                            logoUrl: newTeamLogo,
                          }}
                          size="md"
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-400">Prévia</div>
                          <div className="text-sm font-black text-white">
                            {newTeamName || 'Nome do Time'}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {editingTeamId && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTeamId(null);
                              setNewTeamName('');
                              setNewTeamLogo('');
                            }}
                            className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
                          >
                            Cancelar
                          </button>
                        )}
                        <button
                          type="submit"
                          className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-sm transition"
                        >
                          {editingTeamId ? 'Salvar Alterações' : 'Cadastrar Time'}
                        </button>
                      </div>
                    </form>

                    <div className="lg:col-span-8 bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
                      <h3 className="text-base font-black text-white mb-4">
                        Times Cadastrados ({teams.length})
                      </h3>
                      {teams.length === 0 ? (
                        <p className="text-xs text-slate-400 py-8 text-center">
                          Nenhum time cadastrado ainda. Use o formulário ao lado para adicionar os times do Major Singapura 2026.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {teams.map((t) => (
                            <div
                              key={t.id}
                              className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-xl p-2.5"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <TeamBadge team={t} size="sm" />
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-white truncate">
                                    {t.name}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => handleStartEditTeam(t)}
                                  className="p-1.5 text-slate-400 hover:text-cyan-400 rounded-lg hover:bg-slate-900"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTeam(t.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-900"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* SUB-ABA 4: SENHA DO ADMIN, PONTUAÇÃO E BACKUP JSON */}
                {adminSubTab === 'backup' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Alterar Senha do Admin & Pontuação */}
                    <div className="space-y-6">
                      <form
                        onSubmit={handleChangeAdminPassword}
                        className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3"
                      >
                        <h3 className="text-base font-black text-white">
                          Alterar Senha do Administrador
                        </h3>
                        <p className="text-xs text-slate-400">
                          A senha fica neste navegador e só bloqueia a interface; ela não impede alterações diretas no banco.
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={newPasswordInput}
                            onChange={(e) => setNewPasswordInput(e.target.value)}
                            placeholder="Nova senha (mín. 4 caracteres)"
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white outline-none focus:border-cyan-500"
                          />
                          <button
                            type="submit"
                            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs"
                          >
                            Atualizar Senha
                          </button>
                        </div>
                      </form>

                      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
                        <h3 className="text-base font-black text-white">
                          Pontuação por Acerto
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-emerald-400 mb-1">
                              3-0
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={scoring.threeZeroPoints}
                              onChange={(e) =>
                                setScoring({
                                  ...scoring,
                                  threeZeroPoints: Number(e.target.value) || 0,
                                })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-bold text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-cyan-400 mb-1">
                              3-1 / 3-2
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={scoring.advancePoints}
                              onChange={(e) =>
                                setScoring({
                                  ...scoring,
                                  advancePoints: Number(e.target.value) || 0,
                                })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-bold text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-rose-400 mb-1">
                              0-3
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={scoring.zeroThreePoints}
                              onChange={(e) =>
                                setScoring({
                                  ...scoring,
                                  zeroThreePoints: Number(e.target.value) || 0,
                                })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-bold text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-purple-300 mb-1">
                              Finalista
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={scoring.playoffFinalistPoints}
                              onChange={(e) =>
                                setScoring({
                                  ...scoring,
                                  playoffFinalistPoints: Number(e.target.value) || 0,
                                })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-bold text-white"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[11px] font-black text-amber-400 mb-1">
                              Campeão do Major (Maior Pontuação)
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={scoring.championPoints}
                              onChange={(e) =>
                                setScoring({
                                  ...scoring,
                                  championPoints: Number(e.target.value) || 0,
                                })
                              }
                              className="w-full bg-slate-950 border border-amber-500/50 rounded-lg px-3 py-1.5 text-sm font-black text-amber-300"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Backup JSON */}
                    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
                      <h3 className="text-base font-black text-white">
                        Backup JSON do Bolão
                      </h3>
                      <p className="text-xs text-slate-400">
                        Exporte ou restaure os dados compartilhados. “Zerar Tudo” apaga o Supabase e a cópia local deste navegador após confirmação.
                      </p>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={handleExportBackupJson}
                          className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs flex items-center gap-1.5"
                        >
                          <Copy className="w-4 h-4" />
                          <span>Copiar Backup JSON</span>
                        </button>
                        <button
                          onClick={handleClearAllData}
                          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-300 font-bold text-xs flex items-center gap-1.5"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Zerar Tudo</span>
                        </button>
                      </div>

                      <textarea
                        rows={4}
                        value={backupJsonInput}
                        onChange={(e) => setBackupJsonInput(e.target.value)}
                        placeholder="Cole aqui um backup JSON para restaurar..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-mono text-slate-300 outline-none"
                      />

                      <button
                        onClick={handleImportBackupJson}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Restaurar Backup JSON</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* ==================================================================== */}
      {/* MODAL DE DETALHAMENTO DOS PALPITES DO PARTICIPANTE                 */}
      {/* ==================================================================== */}
      {inspectingPick && (
        <div
          onClick={() => setInspectingPick(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Detalhamento de Picks
                </span>
                <h3 className="text-2xl font-black text-white mt-0.5">
                  {inspectingPick.userName}{' '}
                  <span className="text-base font-bold text-amber-400 ml-2">
                    ({inspectingPick.totalPoints} pts)
                  </span>
                </h3>
              </div>
              <button
                onClick={() => setInspectingPick(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {inspectingPick.stageEntries.map(({ pick, stage, evaluation }) => {
              const hasOfficial = evaluation.hasOfficialResults;

              const renderTeamChip = (teamId, officialIds = []) => {
                const team = teamsMap[teamId];
                if (!team) return null;
                const isHit = officialIds.includes(teamId);
                const isMiss = hasOfficial && !isHit;

                return (
                  <div
                    key={teamId}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border ${
                      isHit
                        ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-100'
                        : isMiss
                        ? 'bg-rose-950/30 border-rose-500/30 text-slate-400'
                        : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <TeamBadge team={team} size="xs" />
                      <span className="text-xs font-bold truncate">{team.name}</span>
                    </div>
                    {isHit && (
                      <span className="text-[10px] font-black bg-emerald-500 text-slate-950 px-1.5 py-0.5 rounded shrink-0">
                        ACERTOU
                      </span>
                    )}
                    {isMiss && (
                      <span className="text-[10px] font-bold bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded shrink-0">
                        ERROU
                      </span>
                    )}
                  </div>
                );
              };

              return (
                <div
                  key={pick.id}
                  className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-black text-cyan-400">
                      {stage?.name || 'Fase'}
                    </h4>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="bg-slate-800 px-2.5 py-1 rounded-lg font-bold text-slate-200">
                        {evaluation.hitsCount} acerto(s)
                      </span>
                      <span className="bg-amber-500/20 border border-amber-500/40 px-2.5 py-1 rounded-lg font-black text-amber-400">
                        {evaluation.totalPoints} pts
                      </span>
                    </div>
                  </div>

                  {stage?.type === 'playoffs' ? (
                    <div className="space-y-3">
                      {pick.picks.champion && (
                        <div>
                          <div className="text-[11px] font-black uppercase text-amber-400 mb-1.5">
                            Campeão Escolhido
                          </div>
                          {renderTeamChip(
                            pick.picks.champion,
                            stage?.results?.champion ? [stage.results.champion] : []
                          )}
                        </div>
                      )}
                      {(pick.picks.finalists || []).length > 0 && (
                        <div>
                          <div className="text-[11px] font-black uppercase text-purple-300 mb-1.5">
                            Finalistas
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {pick.picks.finalists.map((id) =>
                              renderTeamChip(id, stage?.results?.finalists || [])
                            )}
                          </div>
                        </div>
                      )}
                      {(pick.picks.semifinalists || []).length > 0 && (
                        <div>
                          <div className="text-[11px] font-black uppercase text-cyan-300 mb-1.5">
                            Semifinalistas
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {pick.picks.semifinalists.map((id) =>
                              renderTeamChip(id, stage?.results?.semifinalists || [])
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="text-[11px] font-black uppercase text-emerald-400 mb-1.5">
                          3-0
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(pick.picks.threeZero || []).map((id) =>
                            renderTeamChip(id, stage?.results?.threeZero || [])
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] font-black uppercase text-cyan-400 mb-1.5">
                          3-1 / 3-2
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {(pick.picks.advance || []).map((id) =>
                            renderTeamChip(id, stage?.results?.advance || [])
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] font-black uppercase text-rose-400 mb-1.5">
                          0-3
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(pick.picks.zeroThree || []).map((id) =>
                            renderTeamChip(id, stage?.results?.zeroThree || [])
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}