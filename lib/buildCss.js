'use strict';
const path = require('path');
const jdfUtils = require('jdf-utils');
const $ = jdfUtils.base;
const f = jdfUtils.file;
const logger = require('jdf-log');

//外部组件
const Sass = require('node-sass');
const Less = require('less');
const postcss = require('postcss');
const autoprefixer = require('autoprefixer');

const jdf = require('./jdf');
const VFS = require('./VFS/VirtualFileSystem');

let buildCss = module.exports = {};

buildCss.init = function () {
    logger.profile('parse css');
    return VFS.go()
    .then(() => {
        return VFS.travel((vfile, done) => {
            let oPath = vfile.originPath;
            if ($.is.sass(oPath)) {
                done.push(buildCss.handleSass(vfile));
            } else if ($.is.less(oPath)) {
                done.push(buildCss.handleLess(vfile));
            } else if ($.is.css(oPath)) {
                done.push(buildCss.handleCss(vfile));
            }
        });
    })
    .then(() => {
        return VFS.travel((vfile, done) => {
            if (buildCss.isCssRelative(vfile)) {
                done.push(buildCss.postCSSProcess(vfile));
            }
        });
    })
    .then(() => {
        logger.profile('parse css');
        return Promise.resolve();
    });
}

buildCss.handleSass = function (vfile) {
    return new Promise (function (resolve, reject) {
        let oPath = vfile.originPath;
        logger.verbose(`parse sass: ${oPath}`);
        Sass.render({
            file: oPath,
            outputStyle: 'expanded',
            importer: function(url, prev, done){
                var extname = path.extname(url);

                if(extname == '.sass' || extname == '.scss' || extname == '.css'){
                    return {file: url};
                }else{
                    return {file: url += (path.extname(prev))};
                }

            }
        }, function (err, result) {
            if (err) {
                logger.error(err.formatted);
                reject(err);
                return;
            }
            vfile.targetContent = result.css.toString();
            if (!vfile.targetPath) {
                vfile.targetPath = vfile.originPath;
            }
            vfile.targetPath = vfile.targetPath.replace(/scss$/, 'css');
            resolve();
        });
    });
}

buildCss.handleLess = function (vfile) {
    return new Promise(function (resolve, reject) {
        let lessContent;
        if (!vfile.originContent) {
            lessContent = f.read(vfile.originPath);
        } else {
            lessContent = vfile.originContent;
        }

        logger.verbose(`parse less: ${vfile.originPath}`);
        Less.render(lessContent, {filename: vfile.originPath, syncImport: true})
        .then(function (output) {
            vfile.originContent = lessContent;
            vfile.targetContent = output.css;
            if (!vfile.targetPath) {
                vfile.targetPath = vfile.originPath;
            }
            vfile.targetPath = vfile.targetPath.replace(/less$/, 'css');
            resolve();
        }, function (err) {
            logger.error(`parse less file ${fileFullPath}`);
            console.log(err);
            reject(err);
        });
    });
}

buildCss.handleCss = function (vfile) {
    return vfile;
}

buildCss.postCSSProcess = function (vfile) {
    // 更多插件可以再扩展
    let cssAutoPrefixer = jdf.config.output.cssAutoPrefixer;
    let browsers = jdf.config.output.browserslist || [];
    let plugins = [autoprefixer({remove: cssAutoPrefixer, browsers: browsers})];
    logger.verbose(`postcss - autoprefixer: parsed ${vfile.originPath}`);
    return new Promise(function (resolve, reject) {
        postcss(plugins)
        .process(vfile.targetContent)
        .then(result => {
            vfile.targetContent = result.css;
            resolve();
        })
        .catch(err => {
            reject(err);
        });
    });
}

buildCss.isCssRelative = function (vfile) {
    let oPath = vfile.originPath;
    if (!($.is.less(oPath) || $.is.sass(oPath) || $.is.css(oPath))) {
        return false;
    }
    return true;
}

