import { createProject } from '@ts-morph/bootstrap'

const project = await createProject({ tsConfigFilePath: 'tsconfig.json' })

export async function getSourceFiles(path: string) {
  return await project.addSourceFilesByPaths(path)
}
