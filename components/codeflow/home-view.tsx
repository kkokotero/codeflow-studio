'use client'

import { useMemo } from 'react'

import { APP_ICONS } from '@/components/codeflow/app-icons'
import { PageHeader } from '@/components/codeflow/page-header'
import { ProgressRing } from '@/components/codeflow/progress-ring'
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
  onImportFolder: () => void
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
 * otro nuevo o consultar los logros. También es válida sin ningún proyecto:
 * la lista vacía ofrece las mismas acciones en lugar de un error.
 *
 * La composición imita la de una app de escritorio: un título grande, una
 * franja de resumen con las cifras del espacio de trabajo y las tarjetas de
 * proyecto como objetos principales, con la progresión en una columna lateral.
 */
export function HomeView({
  projects,
  activeProjectId,
  profile,
  onOpenProject,
  onCreateProject,
  onImportProject,
  onImportFolder,
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
  const totalFiles = projects.reduce((count, project) => count + project.files.length, 0)
  const totalFolders = projects.reduce((count, project) => count + project.folders.filter((folder) => folder.parentId !== null).length, 0)

  return (
    <div className="cf-home">
      <div className="cf-home__scroll">
        <section className="cf-home__projects" aria-label="Proyectos">
          <PageHeader
            eyebrow={<><APP_ICONS.home aria-hidden="true" /> Espacio de trabajo</>}
            title="Proyectos"
            description={projects.length === 0
              ? 'Todavía no hay proyectos. Crea uno o importa el código desde el disco.'
              : `${projects.length} proyecto${projects.length === 1 ? '' : 's'} · ${totalFiles} archivo${totalFiles === 1 ? '' : 's'}${totalFolders > 0 ? ` · ${totalFolders} carpeta${totalFolders === 1 ? '' : 's'}` : ''}`}
            actions={(
              <>
                <Button variant="outline" size="sm" onClick={onImportProject}>
                  <APP_ICONS.import aria-hidden="true" /> Importar proyecto
                </Button>
                <Button variant="default" size="sm" onClick={onCreateProject}>
                  <APP_ICONS.newFolder aria-hidden="true" /> Nuevo proyecto
                </Button>
              </>
            )}
          />

          <dl className="cf-summary" aria-label="Resumen del espacio de trabajo">
            <div className="cf-summary__item">
              <dt><APP_ICONS.folder aria-hidden="true" /> Proyectos</dt>
              <dd>{projects.length}</dd>
            </div>
            <div className="cf-summary__item">
              <dt><APP_ICONS.code aria-hidden="true" /> Archivos</dt>
              <dd>{totalFiles}</dd>
            </div>
            <div className="cf-summary__item">
              <dt><APP_ICONS.newFolder aria-hidden="true" /> Carpetas</dt>
              <dd>{totalFolders}</dd>
            </div>
            <div className="cf-summary__item">
              <dt><APP_ICONS.trophy aria-hidden="true" /> Experiencia</dt>
              <dd>{(profile?.xp ?? 0).toLocaleString('es')} <small>XP</small></dd>
            </div>
          </dl>

          {sorted.length === 0 ? (
            <div className="cf-empty cf-empty--home">
              <span className="cf-empty__glyph"><APP_ICONS.home aria-hidden="true" /></span>
              <strong>Sin proyectos todavía</strong>
              <span>
                Puedes empezar de cero con un proyecto vacío, importar un paquete
                <code>.codeflow.json</code> o traerme una carpeta entera del disco.
              </span>
              <div className="cf-empty__actions">
                <Button variant="default" size="sm" onClick={onCreateProject}>
                  <APP_ICONS.newFolder aria-hidden="true" /> Crear un proyecto
                </Button>
                <Button variant="outline" size="sm" onClick={onImportFolder}>
                  <APP_ICONS.newFolder aria-hidden="true" /> Importar una carpeta
                </Button>
              </div>
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
                        <p className="cf-project-card__meta">
                          <span className="cf-chip cf-chip--quiet">
                            {project.files.length} archivo{project.files.length === 1 ? '' : 's'}
                          </span>
                          {folderCount > 0 && (
                            <span className="cf-chip cf-chip--quiet">
                              {folderCount} carpeta{folderCount === 1 ? '' : 's'}
                            </span>
                          )}
                          <span className="cf-chip cf-chip--quiet cf-chip--time">{relativeDate(project.updatedAt)}</span>
                        </p>
                      </div>
                      <div className="cf-project-card__actions">
                        {isActive && <span className="cf-chip cf-chip--active">Abierto</span>}
                        <Button variant="outline" size="sm" onClick={() => onOpenProject(project.id)}>
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
                              <MenuItem icon={APP_ICONS.exportProject} onClick={() => onExportProject(project)}>Exportar proyecto…</MenuItem>
                            </MenuGroup>
                            <MenuSeparator />
                            <MenuGroup>
                              <MenuItem icon={APP_ICONS.delete} destructive onClick={() => onDeleteProject(project)}>
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
          <section className="cf-home__panel cf-home__panel--progress">
            <div className="cf-home__panel-title">
              <span className="cf-level__emblem" aria-hidden="true"><APP_ICONS.trophy /></span>
              <div>
                <span className="cf-home__eyebrow">Tu progreso</span>
                <h2>{profile?.name ?? 'Integrante'}</h2>
              </div>
            </div>
            {level && (
              <div className="cf-home__ring">
                <ProgressRing
                  value={level.progress}
                  size={96}
                  stroke={9}
                  label={`Nivel ${level.level}: ${level.earnedAtLevel} de ${level.nextLevelXp} XP`}
                >
                  <strong>{level.level}</strong>
                  <small>nivel</small>
                </ProgressRing>
                <div className="cf-home__ring-copy">
                  <strong>{profile?.xp.toLocaleString('es') ?? 0} XP</strong>
                  <span>{level.earnedAtLevel} / {level.nextLevelXp} XP para el nivel {level.level + 1}</span>
                </div>
              </div>
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

          <section className="cf-home__panel cf-home__panel--muted">
            <span className="cf-home__eyebrow">Siguiente paso</span>
            <p className="cf-home__hint">
              {projects.length === 0
                ? 'Crea un proyecto y abre un archivo de ejemplo para ver el diagrama en acción.'
                : 'Abre un proyecto, ejecuta un archivo y revisa el diagrama que genera.'}
            </p>
            <Button variant="ghost" size="sm" onClick={() => onImportFolder()} className="cf-home__link">
              <APP_ICONS.newFolder aria-hidden="true" /> Importar una carpeta
            </Button>
          </section>
        </aside>
      </div>
    </div>
  )
}
