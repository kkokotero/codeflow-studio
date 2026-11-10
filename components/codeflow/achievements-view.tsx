'use client'

import { useState } from 'react'
import {
  Blocks, Bug, Check, Code2, Compass, Flame, GitBranch, Hammer, Languages,
  LockKeyhole, MessageCircleCode, Play, Repeat2, Sparkles, Trophy, WandSparkles,
  type LucideIcon,
} from 'lucide-react'
import {
  ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES, getAchievementStatus, getLevelProgress,
  type AchievementCategory, type AchievementDefinition, type AchievementProfile,
} from '@/lib/achievements'

const icons: Record<string, LucideIcon> = {
  Blocks, Bug, Code2, Compass, Flame, GitBranch, Hammer, Languages, MessageCircleCode,
  Play, Repeat2, Trophy, WandSparkles,
}

const filters: Array<'Todos' | AchievementCategory> = ['Todos', ...ACHIEVEMENT_CATEGORIES]

function AchievementCard({ achievement, profile }: { achievement: AchievementDefinition; profile: AchievementProfile }) {
  const status = getAchievementStatus(profile, achievement)
  const Icon = icons[achievement.icon] ?? Sparkles
  const progress = achievement.progress(profile.stats)
  const percentage = Math.round(progress.current / progress.target * 100)

  return <article className={`achievement-card achievement-card--${status}`}>
    <div className="achievement-card__top">
      <span className="achievement-icon"><Icon aria-hidden="true" /></span>
      <span className={`achievement-difficulty achievement-difficulty--${achievement.difficulty.toLowerCase()}`}>{achievement.difficulty}</span>
      <span className="achievement-xp">+{achievement.xp} XP</span>
    </div>
    <div className="achievement-card__body">
      <div className="achievement-card__title"><h3>{achievement.name}</h3>{status === 'unlocked' ? <Check aria-label="Desbloqueado" /> : <LockKeyhole aria-label="Pendiente" />}</div>
      <p>{achievement.description}</p>
    </div>
    <div className="achievement-card__condition"><span>CONDICIÓN</span>{achievement.condition}</div>
    <div className="achievement-card__hint"><span>PISTA</span>{achievement.hint}</div>
    <div className="achievement-card__footer">
      {status === 'unlocked' ? <span className="achievement-earned"><Check aria-hidden="true" /> Desbloqueado</span> : <>
        <span className="achievement-progress-label">{status === 'in-progress' ? `${progress.current} / ${progress.target}` : 'Por descubrir'}</span>
        {status === 'in-progress' && <div className="achievement-progress" role="progressbar" aria-label={`Progreso de ${achievement.name}`} aria-valuenow={progress.current} aria-valuemin={0} aria-valuemax={progress.target}><span style={{ width: `${percentage}%` }} /></div>}
      </>}
    </div>
  </article>
}

export function AchievementsView({ profile }: { profile: AchievementProfile }) {
  const [category, setCategory] = useState<'Todos' | AchievementCategory>('Todos')
  const level = getLevelProgress(profile.xp)
  const unlockedCount = ACHIEVEMENTS.filter((achievement) => profile.unlocked[achievement.id]).length
  const completion = Math.round(unlockedCount / ACHIEVEMENTS.length * 100)
  const recommended = ACHIEVEMENTS
    .filter((achievement) => !profile.unlocked[achievement.id])
    .slice(0, 3)
  const visibleAchievements = category === 'Todos' ? ACHIEVEMENTS : ACHIEVEMENTS.filter((achievement) => achievement.category === category)
  const earnedAchievements = ACHIEVEMENTS.filter((achievement) => profile.unlocked[achievement.id])

  return <section className="achievement-page" aria-label="Progresión y logros">
    <div className="achievement-scroll">
      <div className="achievement-page__heading">
        <div><span className="achievement-eyebrow"><Sparkles aria-hidden="true" /> RUTA DE APRENDIZAJE</span><h1>Logros y progresión</h1><p>Cada intento cuenta. Sigue construyendo tu camino.</p></div>
        <div className="achievement-completion"><span>COLECCIÓN</span><strong>{completion}%</strong><small>{unlockedCount} de {ACHIEVEMENTS.length} logros</small></div>
      </div>

      <section className="level-panel" aria-label="Perfil y experiencia">
        <div className="level-panel__identity"><span className="level-emblem"><Trophy aria-hidden="true" /></span><div><span className="achievement-eyebrow">INTEGRANTE</span><h2>{profile.name}</h2><span className="level-rank">Nivel {level.level} <span>·</span> Aprendiz en movimiento</span></div></div>
        <div className="level-panel__progress"><div className="level-panel__numbers"><span><strong>{profile.xp.toLocaleString('es')}</strong> XP acumulados</span><span>{level.earnedAtLevel} / {level.nextLevelXp} XP al nivel {level.level + 1}</span></div><div className="level-bar" role="progressbar" aria-label="Progreso al siguiente nivel" aria-valuenow={level.earnedAtLevel} aria-valuemin={0} aria-valuemax={level.nextLevelXp}><span style={{ width: `${level.progress * 100}%` }} /></div><div className="level-panel__caption"><span>NIVEL {level.level}</span><span>NIVEL {level.level + 1}</span></div></div>
        <div className="level-panel__stat"><strong>{unlockedCount.toString().padStart(2, '0')}<span>/{ACHIEVEMENTS.length}</span></strong><small>insignias</small></div>
      </section>

      {earnedAchievements.length > 0 && <section className="badge-gallery" aria-label="Insignias desbloqueadas">
        <div className="achievement-section-heading"><div><span className="achievement-eyebrow">TU COLECCIÓN</span><h2>Insignias desbloqueadas</h2></div><span>{earnedAchievements.length} conseguidas</span></div>
        <div className="badge-strip">{earnedAchievements.map((achievement) => {
          const Icon = icons[achievement.icon] ?? Sparkles
          return <div className="badge-item" key={achievement.id} title={`${achievement.name} · +${achievement.xp} XP`}><span><Icon aria-hidden="true" /></span><small>{achievement.name}</small></div>
        })}</div>
      </section>}

      {recommended.length > 0 && <section className="recommended-section" aria-label="Próximos desafíos recomendados">
        <div className="achievement-section-heading"><div><span className="achievement-eyebrow">SIGUIENTE PASO</span><h2>Desafíos recomendados</h2></div><span>Empieza por uno</span></div>
        <div className="recommended-grid">{recommended.map((achievement) => <AchievementCard key={achievement.id} achievement={achievement} profile={profile} />)}</div>
      </section>}

      <section className="all-achievements" aria-label="Todos los logros">
        <div className="achievement-section-heading"><div><span className="achievement-eyebrow">MAPA COMPLETO</span><h2>Todos los logros</h2></div><span>{visibleAchievements.length} desafíos</span></div>
        <div className="achievement-filters" role="group" aria-label="Filtrar logros por categoría">{filters.map((filter) => <button key={filter} type="button" className={category === filter ? 'is-active' : ''} aria-pressed={category === filter} onClick={() => setCategory(filter)}>{filter}</button>)}</div>
        <div className="achievement-grid">{visibleAchievements.map((achievement) => <AchievementCard key={achievement.id} achievement={achievement} profile={profile} />)}</div>
      </section>
    </div>
  </section>
}