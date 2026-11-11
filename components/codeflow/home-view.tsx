'use client'

import { useMemo } from 'react'

import { APP_ICONS } from '@/components/codeflow/app-icons'
import { Button } from '@/components/ui/button'
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import { ACHIEVEMENTS, getLevelProgress, type AchievementProfile } from '@/lib/achievements'
import type { Project } from '@/lib/storage'

interface HomeViewProps {
  projects: Project[]
  activeProjectId: string | null
  profile: AchievementProfile | null
  onOpenProject: (projectId: string) => void
  onCreateProject: () => void
  onImportProject: () => void
  onRenameProject: (project: Project) => void
  onDeleteProject: (project: Project) => void
  onExportProject: (project: Project) => void
  onOpenAchievements: () => void
}

function relativeDate(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  return new Date(timestamp).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

/**
 * Vista principal: los proyectos de la sesión y el estado de la progresión.
 *
 * Es el punto de entrada al estudio: elegir un proyecto para abrirlo, crear
 * otro nuevo o consultar los logros, sin menús dispersos.
 */
export function HomeView({
  projects,
  activeProjectId,
  profile,
  onOpenProject,
  onCreateProject,
  onImportProject,
  onRenameProject,
  onDeleteProject,
  onExportProject,
  onOpenAchievements,
}: HomeViewProps) {
  const sorted = useMemo(
    () => [...projects].sort((left, right) => right.updatedAt - left.updatedAt),
    [projects],
  )
  const level = profile ? getLevelProgress(profile.xp) : null
  const unlockedCount = profile ? Object.keys(profile.unlocked).length : 0
  const badges = profile
    ? ACHIEVEMENTS.filter((achievement) => profile.unlocked[achievement.id]).slice(0, 6)
    : []

  return (
    <div className="cf-home">
      <div className="cf-home__scroll">
        <section className="cf-home__projects" aria-label="Proyectos">
          <header className="cf-home__heading">
            <div>
              <span className="cf-home__eyebrow"><APP_ICONS.home aria-hidden="true" /> Espacio de trabajo</span>
              <h1>Proyectos</h1>
              <p>{projects.length === 0 ? 'Todavía no hay proyectos en esta sesión.' : `${projects.length} proyecto${projects.length === 1 ? '' : 's'} en esta sesión.`}</p>
            </div>
            <div className="cf-home__actions">
              <Button variant="outline" size="sm" onClick={onImportProject}>
                <APP_ICONS.import aria-hidden="true" /> Importar
              </Button>
              <Button variant="default" size="sm" onClick={onCreateProject}>
                <APP_ICONS.newFolder aria-hidden="true" /> Nuevo proyecto
              </Button>
            </div>
          </header>

          {sorted.length === 0 ? (
            <div className="cf-empty cf-empty--home">
              <APP_ICONS.home aria-hidden="true" />
              <strong>Sin proyectos todavía</strong>
              <span>Crea un proyecto para empezar a escribir código, o importa un archivo <code>.codeflow.json</code>.</span>
              <Button variant="default" size="sm" onClick={onCreateProject}>Crear el primero</Button>
            </div>
          ) : (
            <ul className="cf-project-list">
              {sorted.map((project) => {
                const isActive = project.id === activeProjectId
                const folderCount = project.folders.filter((folder) => folder.parentId !== null).length
                return (
                  <li key={project.id}>
                    <article className={`cf-project-card ${isActive ? 'is-active' : ''}`}>
                      <span className="cf-project-card__icon" aria-hidden="true"><APP_ICONS.folder /></span>
                      <div className="cf-project-card__body">
                        <h2>{project.name}</h2>
                        <p>
                          {project.files.length} archivo{project.files.length === 1 ? '' : 's'}
                          {folderCount > 0 ? ` · ${folderCount} carpeta${folderCount === 1 ? '' : 's'}` : ''}
                          <span aria-hidden="true"> · </span>
                          {relativeDate(project.updatedAt)}
                        </p>
                      </div>
                      <div className="cf-project-card__actions">
                        <Button variant={isActive ? 'secondary' : 'default'} size="sm" onClick={() => onOpenProject(project.id)}>
                          {isActive ? 'Continuar' : 'Abrir'}
                        </Button>
                        <Menu>
                          <MenuTrigger
                            render={<Button variant="ghost" size="icon-sm" />}
                            className="cf-icon-button"
                            aria-label={`Acciones de ${project.name}`}
                            title="Acciones"
                          >
                            <APP_ICONS.more aria-hidden="true" />
                          </MenuTrigger>
                          <MenuContent align="end">
                            <MenuGroup>
                              <MenuGroupLabel>Proyecto</MenuGroupLabel>
                              <MenuItem icon={APP_ICONS.open} onClick={() => onOpenProject(project.id)}>Abrir en el estudio</MenuItem>
                              <MenuItem icon={APP_ICONS.rename} onClick={() => onRenameProject(project)}>Renombrar…</MenuItem>
                              <MenuItem icon={APP_ICONS.exportProject} onClick={() => onExportProject(project)}>Exportar proyecto</MenuItem>
                            </MenuGroup>
                            <MenuSeparator />
                            <MenuGroup>
                              <MenuItem icon={APP_ICONS.delete} destructive onClick={() => onDeleteProject(project)} disabled={projects.length <= 1}>
                                Eliminar proyecto
                              </MenuItem>
                            </MenuGroup>
                          </MenuContent>
                        </Menu>
                      </div>
                    </article>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <aside className="cf-home__side" aria-label="Progresión">
          <section className="cf-home__panel">
            <div className="cf-home__panel-title">
              <span className="cf-level__emblem" aria-hidden="true"><APP_ICONS.trophy /></span>
              <div>
                <span className="cf-home__eyebrow">Tu progreso</span>
                <h2>{profile?.name ?? 'Integrante'}</h2>
              </div>
            </div>
            {level && (
              <>
                <div className="cf-level__numbers">
                  <span><strong>{profile?.xp.toLocaleString('es') ?? 0}</strong> XP acumulados</span>
                  <span>Nivel {level.level}</span>
                </div>
                <div className="cf-level__bar" role="progressbar" aria-label="Progreso al siguiente nivel" aria-valuenow={level.earnedAtLevel} aria-valuemin={0} aria-valuemax={level.nextLevelXp}>
                  <span style={{ width: `${level.progress * 100}%` }} />
                </div>
                <p className="cf-home__hint">{level.earnedAtLevel} / {level.nextLevelXp} XP para el nivel {level.level + 1}</p>
              </>
            )}
            <div className="cf-home__badges" aria-label="Insignias conseguidas">
              {badges.length === 0 ? (
                <span className="cf-home__muted">Sin insignias todavía.</span>
              ) : (
                badges.map((achievement) => (
                  <span className="cf-badge" key={achievement.id} title={`${achievement.name} · +${achievement.xp} XP`}>
                    <span><APP_ICONS.trophy aria-hidden="true" /></span>
                    <small>{achievement.name}</small>
                  </span>
                ))
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={onOpenAchievements} className="cf-home__link">
              Ver los {unlockedCount} logros
              <APP_ICONS.chevronRight aria-hidden="true" />
            </Button>
          </section>
        </aside>
      </div>
    </div>
  )
}
