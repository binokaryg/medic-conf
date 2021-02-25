const api = require('./api')();
const argsFormFilter = require('./args-form-filter');
const fs = require('./sync-fs');
const log = require('./log');
const { getFormDir, getFormFilePaths } = require('./forms-utils');

//TODO Add this to the main loop
module.exports = (projectDir, subDirectory, options={}) => {

  const formsDir = getFormDir(projectDir, subDirectory);
  if(!formsDir) {
    log.warn(`Forms dir not found: ${formsDir}`);
    return Promise.resolve();
  }

  let hasInstanceIdFoundErrors = false;
  let validateEndpointFoundErrors = false;
  return argsFormFilter(formsDir, '.xml', options)
    .reduce((promiseChain, fileName) => {
      log.info(`Validating form: ${fileName}…`);

      const { xformPath, filePath } = getFormFilePaths(formsDir, fileName);
      const xml = fs.read(xformPath);

      if(!formHasInstanceId(xml)) {
        log.error(`Form at ${xformPath} appears to be missing <meta><instanceID/></meta> node. This form will not work on medic-webapp.`);
        hasInstanceIdFoundErrors = true;
        return Promise.resolve();
      }

      return _formsValidate(xml)
        .catch(err => {
          log.error(`Form ${filePath} with errors, API validations response: ${err.message}`);
          validateEndpointFoundErrors = true;
        });
    }, Promise.resolve())
    .then(() => {
      // Once all the fails were checked raise an exception if there were errors
      let errors = [];
      if (validateEndpointFoundErrors) {
        errors.push('One or more forms appears to have errors found by the API validation endpoint.');
      }
      if (hasInstanceIdFoundErrors) {
        errors.push('One or more forms appears to be missing <meta><instanceID/></meta> node.');
      }
      if (errors.length) {
        // the blank spaces are a trick to align the errors in the log ;)
        throw new Error(errors.join('\n             '));
      }
    });
};

let validateEndpointNotFoundLogged = false;
const _formsValidate = (xml) => {
  return api.formsValidate(xml)
    .then(resp => {
      if (resp.formsValidateEndpointFound === false &&
          !validateEndpointNotFoundLogged) {
        log.warn('Form validation endpoint not found in your version of CHT Core, ' +
          'no form will be checked before push');
        validateEndpointNotFoundLogged = true; // Just log the message once
      }
    });
};

const formHasInstanceId = xml => xml.includes('<instanceID/>');
