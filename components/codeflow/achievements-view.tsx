'use client'

import { useMemo, useState } from 'react'
import {
  Binary, Blocks, Boxes, Braces, Bug, CalendarDays, Check, Code2, Compass, Crown,
  Divide, Download, FilePlus2, Flame, FolderOpen, Gauge, GitBranch, GitCommitHorizontal,
  Hammer, Hash, History, Infinity, Languages, Layers, Lightbulb, ListChecks,
  LockKeyhole, MessageCircleCode, Network, Play, Puzzle, Repeat2, Route, Rows3,
  Ruler, ScanSearch, Sigma, Sparkles, Terminal, Timer, Trash2, Trophy, Upload,
  WandSparkles, Workflow, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react'

import { APP_ICONS } from '@/components/codeflow/app-icons'
import { PageHeader } from '@/components/codeflow/page-header'
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  getAchievementStatus,
  getLevelProgress,
  type AchievementCategory,
  type AchievementDefinition,
  type AchievementProfile,
} from '@/lib/achievements'

const icons: Record<string, LucideIcon> = {
  Binary, Blocks, Boxes, Braces, Bug, CalendarDays, Code2, Compass, Crown, Divide,
  Download, FilePlus2, Flame, FolderOpen, Gauge, GitBranch, GitCommitHorizontal, Hammer,
  Hash, History, Infinity, Languages, Layers, Lightbulb, ListChecks, MessageCircleCode,
  Network, Play, Puzzle, Repeat2, Route, Rows3, Ruler, ScanSearch, Sigma, Sparkles,
  Terminal, Timer, Trash2, Trophy, Upload, WandSparkles, Workflow, Wrench, Zap,
}

const filters: Array<'Todos' | AchievementCategory> = ['Todos', ...ACHIEVEMENT_CATEGORIES]

function AchievementCard({ achievement, profile }: { achievement: AchievementDefinition; profile: AchievementProfile }) {
  const status = getAchievementStatus(profile, achievement)
  const Icon = icons[achievement.icon] ?? Sparkles
  const progress = achievement.progress(profile.stats)
  const percentage = Math.round(progress.current / progress.target * 100)

  return <article className={`cf-achievement-card cf-achievement-card--${status}`}>
    <div className="cf-achievement-card__top">
      <span className="cf-achievement-card__icon"><Icon aria-hidden="true" /></span>
      <span className={`cf-achievement-card__difficulty cf-achievement-card__difficulty--${achievement.difficulty.toLowerCase()}`}>{achievement.difficulty}</span>
      <span className="cf-achievement-card__xp">+{achievement.xp} XP</span>
    </div>
    <div className="cf-achievement-card__body">
      <div className="cf-achievement-card__title">
        <h3>{achievement.name}</h3>
        {status === 'unlocked'
          ? <Check aria-label="Desbloqueado" />
          : <LockKeyhole aria-label="Pendiente" />}
      </div>
      <p>{achievement.description}</p>
    </div>
    {status === 'in-progress' && (
      <div className="cf-achievement-card__progress" role="progressbar" aria-label={`Progreso de ${achievement.name}`} aria-valuenow={progress.current} aria-valuemin={0} aria-valuemax={progress.target}>
        <span style={{ width: `${percentage}%` }} />
      </div>
    )}
    <div className="cf-achievement-card__condition"><span>Condición</span>{achievement.condition}</div>
    <div className="cf-achievement-card__hint"><span>Pista</span>{achievement.hint}</div>
    <div className="cf-achievement-card__footer">
      {status === 'unlocked' ? <span className="cf-achievement-card__earned"><Check aria-hidden="true" /> Desbloqueado</span> : (
        <span className="cf-achievement-card__progress-label">
          {status === 'in-progress' ? `${progress.current} / ${progress.target}` : 'Por descubrir'}
        </span>
      )}
    </div>
  </article>
}

interface AchievementsViewProps {
  profile: AchievementProfile
  onBack: () => void
  onRename: (name: string) => void
}

/**
 * Progresión y logros con el mismo lenguaje visual que el estudio: mismas
 * superficies, mismos bordes y el mismo acento para el progreso.
 */
export function AchievementsView({ profile, onBack, onRename }: AchievementsViewProps) {
  const [category, setCategory] = useState<'Todos' | AchievementCategory>('Todos')
  const [editingName, setEditingName] = useState(false)
  const level = getLevelProgress(profile.xp)
  const unlockedCount = ACHIEVEMENTS.filter((achievement) => profile.unlocked[achievement.id]).length
  const completion = Math.round(unlockedCount / ACHIEVEMENTS.length * 100)
  const recommended = ACHIEVEMENTS
    .filter((achievement) => !profile.unlocked[achievement.id])
    .slice(0, 3)
  const visibleAchievements = category === 'Todos' ? ACHIEVEMENTS : ACHIEVEMENTS.filter((achievement) => achievement.category === category)
  const earnedAchievements = ACHIEVEMENTS.filter((achievement) => profile.unlocked[achievement.id])

  const countsByCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const achievement of ACHIEVEMENTS) {
      counts.set(achievement.category, (counts.get(achievement.category) ?? 0) + 1)
    }
    return counts
  }, [])

  return (
    <div className="cf-achievements">
      <div className="cf-achievements__scroll">
        <PageHeader
          back={{ label: 'Volver a los proyectos', onClick: onBack }}
          eyebrow={<><APP_ICONS.trophy aria-hidden="true" /> Ruta de aprendizaje</>}
          title="Logros y progresión"
          description="Cada intento cuenta. Sigue construyendo tu camino."
          aside={(
            <div className="cf-achievements__completion">
              <span>Colección</span>
              <strong>{completion}%</strong>
              <small>{unlockedCount} de {ACHIEVEMENTS.length} logros</small>
            </div>
          )}
        />

        <section className="cf-level" aria-label="Perfil y experiencia">
          <div className="cf-level__identity">
            <span className="cf-level__emblem"><APP_ICONS.trophy aria-hidden="true" /></span>
            <div>
              <span className="cf-achievements__eyebrow">Perfil local</span>
              {editingName ? (
                <form
                  className="cf-level__name-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    onRename(profile.name.trim() || 'Integrante')
                    setEditingName(false)
                  }}
                >
                  <input
                    className="cf-field__input"
                    defaultValue={profile.name}
                    autoFocus
                    aria-label="Nombre del perfil"
                    onBlur={(event) => {
                      onRename(event.target.value.trim() || 'Integrante')
                      setEditingName(false)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setEditingName(false)
                    }}
                  />
                </form>
              ) : (
                <button type="button" className="cf-level__name" onClick={() => setEditingName(true)} title="Cambiar el nombre del perfil">
                  {profile.name}
                </button>
              )}
              <span className="cf-level__rank">Nivel {level.level} · Aprendiz en movimiento</span>
            </div>
          </div>
          <div className="cf-level__progress">
            <div className="cf-level__numbers">
              <span><strong>{profile.xp.toLocaleString('es')}</strong> XP acumulados</span>
              <span>{level.earnedAtLevel} / {level.nextLevelXp} XP al nivel {level.level + 1}</span>
            </div>
            <div className="cf-level__bar" role="progressbar" aria-label="Progreso al siguiente nivel" aria-valuenow={level.earnedAtLevel} aria-valuemin={0} aria-valuemax={level.nextLevelXp}><span style={{ width: `${level.progress * 100}%` }} /></div>
            <div className="cf-level__caption"><span>Nivel {level.level}</span><span>Nivel {level.level + 1}</span></div>
          </div>
          <div className="cf-level__stat"><strong>{unlockedCount.toString().padStart(2, '0')}<span>/{ACHIEVEMENTS.length}</span></strong><small>insignias</small></div>
        </section>

        {earnedAchievements.length > 0 && (
          <section className="cf-badges" aria-label="Insignias desbloqueadas">
            <div className="cf-section-heading">
              <div><span className="cf-achievements__eyebrow">Tu colección</span><h2>Insignias desbloqueadas</h2></div>
              <span>{earnedAchievements.length} conseguidas</span>
            </div>
            <div className="cf-badge-strip">{earnedAchievements.map((achievement) => {
              const Icon = icons[achievement.icon] ?? Sparkles
              return <div className="cf-badge" key={achievement.id} title={`${achievement.name} · +${achievement.xp} XP`}><span><Icon aria-hidden="true" /></span><small>{achievement.name}</small></div>
            })}</div>
          </section>
        )}

        {recommended.length > 0 && (
          <section className="cf-recommended" aria-label="Próximos desafíos recomendados">
            <div className="cf-section-heading">
              <div><span className="cf-achievements__eyebrow">Siguiente paso</span><h2>Desafíos recomendados</h2></div>
              <span>Empieza por uno</span>
            </div>
            <div className="cf-achievement-grid">{recommended.map((achievement) => <AchievementCard key={achievement.id} achievement={achievement} profile={profile} />)}</div>
          </section>
        )}

        <section className="cf-all-achievements" aria-label="Todos los logros">
          <div className="cf-section-heading">
            <div><span className="cf-achievements__eyebrow">Mapa completo</span><h2>Todos los logros</h2></div>
            <span>{visibleAchievements.length} desafíos</span>
          </div>
          <div className="cf-achievement-filters" role="group" aria-label="Filtrar logros por categoría">
            {filters.map((filter) => (
              <button key={filter} type="button" className={category === filter ? 'is-active' : ''} aria-pressed={category === filter} onClick={() => setCategory(filter)}>
                {filter}
                <span className="cf-count">{filter === 'Todos' ? ACHIEVEMENTS.length : countsByCategory.get(filter) ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="cf-achievement-grid">{visibleAchievements.map((achievement) => <AchievementCard key={achievement.id} achievement={achievement} profile={profile} />)}</div>
        </section>
      </div>
    </div>
  )
}
