'use strict'

/*
 * body-parser
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
*/

const multiparty = require('multiparty')
const File = require('./File')
const FileJar = require('./FileJar')
const CE = require('../Exceptions')

/**
 * Multipart class does all the heavy lifting of processing multipart
 * data and allows lazy access to the uploaded files. Ideally this
 * class is used by the BodyParser middleware but if `autoProcess`
 * is set to false, you can use this class manually to read file
 * streams and process them.
 *
 * @class Multipart
 * @constructor
 */
class Multipart {
  constructor (request, disableJar = false) {
    this.req = request.request

    /**
     * Storing which files has been accessed by the end-user. When
     * lazy is set to false, the object is ignored and all files
     * are processed.
     *
     * @type {Object}
     */
    this._filesToAccess = {}

    /**
     * The options and handler attached to a wildcard. Which
     * means all files inside the stream will be handled
     * by the wildcard unless specific handlers are
     * defined.
     *
     * @type {Object}
     */
    this._wildcard = {}

    /**
     * Options to be passed to multiparty
     *
     * @type {Object}
     */
    this._multipartyOptions = {
      autoFields: true,
      autoFiles: false
    }

    /**
     * The callback to be called to access fields
     *
     * @type {Function|Null}
     */
    this._fieldsCallback = null

    /**
     * Storing instance to file jar. Attaching as an helper
     * so that users using this class directly can use
     * some helper methods to know the upload status.
     *
     * This attribute is optional and disabled by the BodyParser
     * when bodyparser middleware using the multipart class
     * for autoProcessing all files.
     *
     * @type {FileJar}
     *
     * @attribute jar
     */
    if (!disableJar) {
      this.jar = new FileJar()
    }
  }

  /**
   * Executed for each part in stream. Returning
   * promise or consuming the stream will
   * advance the process.
   *
   * @method onPart
   *
   * @param  {Stream} part
   *
   * @return {Promise}
   */
  onPart (part) {
    let handler = this._filesToAccess[part.name]

    /**
     * Use wildcard handler when specific handler
     * is not defined
     */
    if (!handler) {
      handler = this._wildcard
    }

    /**
     * No one wants to read this file, so simply advance it
     */
    if (!handler || !handler.callback) {
      return Promise.resolve()
    }

    const fileInstance = new File(part, handler.options)

    /**
     * Only track the file when jar is enabled.
     */
    if (this.jar) {
      this.jar.track(fileInstance)
    }

    return Promise.resolve(handler.callback(fileInstance))
  }

  /**
   * Process files by going over each part of the stream. Files
   * are ignored when there are no listeners listening for them.
   *
   * @method process
   *
   * @return {Promise}
   */
  process () {
    return new Promise((resolve, reject) => {
      const form = new multiparty.Form(this._multipartyOptions)
      form.on('error', reject)
      form.on('part', (part) => {
        this.onPart(part)
          .then(() => part.resume())
          .catch((error) => form.emit('error', error))
      })

      form.on('field', (name, value) => {
        if (typeof (this._fieldsCallback) === 'function') {
          this._fieldsCallback(name, value)
        }
      })

      form.on('close', resolve)
      form.parse(this.req)
    })
  }

  /**
   * Add a listener to file. It is important to attach a callback and
   * handle the processing of the file. Also only one listener can
   * be added at a given point of time, since 2 parties processing
   * a single file doesn't make much sense.
   *
   * @method file
   *
   * @param  {String}   name
   * @param  {Object}   options
   * @param  {Function} callback
   *
   * @chainable
   */
  file (name, options = {}, callback) {
    if (typeof (callback) !== 'function') {
      throw CE.InvalidArgumentException.invalidParameter('multipart.file expects callback to be a function')
    }

    if (name === '*') {
      this._wildcard = { options, callback }
    } else {
      this._filesToAccess[name] = { options, callback }
    }

    return this
  }

  /**
   * Attach a listener to get fields name/value. Callback
   * will be executed for each field inside multipart
   * form/data.
   *
   * @method field
   *
   * @param  {Function} callback
   *
   * @chainable
   */
  field (callback) {
    this._fieldsCallback = callback
    return this
  }
}

module.exports = Multipart
