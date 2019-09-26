const environment = require('../lib/environment');
const fetchFilesFromGoogleDrive = require('../lib/fetch-files-from-google-drive');

module.exports = () => {
  fetchFilesFromGoogleDrive(
      `${environment.pathToProject}/csvs-on-google-drive.json`,
      `${environment.pathToProject}/csv`,
      'text/csv');
};
