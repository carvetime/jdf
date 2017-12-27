"use strict";
/**
* @输出处理后的工程文件
* @param {String} options.outputType，当前的输出模式：debug，plain
* @param {String} options.outputList，当前输出的文件列表数组
*/
const path = require('path');
const fs = require('fs');
const shelljs = require('shelljs');
const escapeStringRegexp = require('escape-string-regexp');

//lib自身组件
const logger = require('jdf-log');
const jdf = require('./jdf.js');
const urlReplace = require('./urlReplace');
const cssSprite = require('./cssSprite');
const base64 = require('./base64');
const compressScheduler = require('./compresser/compressScheduler');
const buildCss = require('./buildCss');
const buildHTML = require('./buildHTML');
const buildHTMLDeep = require('./buildHTMLDeep');
const buildOutputWidget = require('./buildOutputWidget');
const buildES6 = require('./buildES6');
const VFS = require('./VFS/VirtualFileSystem');
const pluginCore = require('./pluginCore');

module.exports.init = function (options) {
    var outputType = options.outputType;

    // 注册插件
    pluginCore.addPluginFromConfiguration();

    return Promise.resolve()
    .then(() => {
        logger.profile('plugin.beforeBuild');
        return pluginCore.excuteBeforeBuild();
    })
    .then(() => {
        logger.profile('plugin.beforeBuild');
        return buildCss.init(options);
    })
    .then(() => {
        if (jdf.config.widgetNesting) {
            return buildHTMLDeep.init(options);
        } else {
            return buildHTML.init(options);
        }
    })
    .then(() => {
        buildES6.init();
    })
    .then(() => {
        if (jdf.config.output.base64) {
            return base64.init();
        }
    })
    .then(() => {
        if (jdf.config.output.cssSprite) {
            cssSprite.init();
        }
    })
    .then(() => {
        return buildOutputWidget.init(options);
    })
    .then(() => {
        return urlReplace.init(options); 
    })
    .then(() => {
        logger.profile('plugin.afterBuild');
        return pluginCore.excuteAfterBuild();
    })
    .then(() => {
        logger.profile('plugin.afterBuild');
        
        logger.profile('delete build files');
        shelljs.rm('-rf', jdf.outputDir);
        logger.profile('delete build files');
    })
    .then(() => {
        logger.profile('filter files');
        let outputList = options.outputList;
        if (!outputList || outputList.length === 0) {
            return;
        }

        var filterPath = [];
        return VFS.travel(vfile => {
            for (let pattern of outputList) {
                let filepath = path.relative(VFS.originDir, vfile.originPath);
                filepath = path.normalize(filepath);
                pattern = path.normalize(pattern);
                let relativepath = path.relative(pattern, filepath);
                let reg = new RegExp('^' + escapeStringRegexp('..' + path.sep));
                if (reg.test(relativepath)) {
                    filterPath.push(vfile.originPath);
                }
            }
        }).then(()=> {
            filterPath.forEach(filepath => {
                VFS.deleteFile(filepath);
            });
        });
    })
    .then(() => {
        logger.profile('filter files');

        if(outputType !== 'debug' && outputType !== 'plain'){
            logger.profile('delete temp files');
            shelljs.rm("-Rf", jdf.transferDir);
            logger.profile('delete temp files');

            return VFS.writeFilesToDir(jdf.transferDir).then(() => {
                return compressScheduler.init(jdf.transferDir, jdf.outputDir);
            });

        }else{
            return VFS.writeFiles();
        }
    })
    .then(() => {
        logger.info('output success');
    })
    .catch(err => {
        logger.error(err);
    });
}
