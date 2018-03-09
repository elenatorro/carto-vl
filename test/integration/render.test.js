const path = require('path');
const chai = require('chai');
const util = require('../utils/common');

chai.use(require('chai-as-promised'));

const files = util.loadFiles(path.join(__dirname, 'render'));
const template = util.loadTemplate(path.join(__dirname, 'render.html.tpl'));

describe('Render tests:', () => {
    files.forEach(test);
});

function test(file) {
    it(util.getName(file), () => {
        const actual = util.testSST(file, template);
        return chai.expect(actual).to.eventually.be.true;
    }).timeout(10000);
}
