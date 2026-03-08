declare module "electron-updater" {
  export type ReleaseNoteInfo = {
    version?: string;
    note?: string;
  };

  export interface UpdateInfo {
    version: string;
    releaseName?: string;
    releaseDate?: string;
    releaseNotes?: string | ReleaseNoteInfo[];
  }

  export interface UpdateDownloadedEvent extends UpdateInfo {}

  export interface ProgressInfo {
    percent: number;
    transferred: number;
    total: number;
    bytesPerSecond: number;
  }
}
