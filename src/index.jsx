/** @jsx createElement */
import _ from 'lodash'
import { createElement } from 'elliptical'
import { setClipboard, showNotification } from 'lacona-api'
import { Command, String, DateTime, Duration } from 'lacona-phrases'
import { onActivate } from 'lacona-source-helpers'
import isRunning from 'is-running'
import moment from 'moment'

import { fromPromise } from 'rxjs/observable/fromPromise'

import { spawn } from 'child_process'
import { join } from 'path'
import { tmpdir } from 'os'
import fs from 'fs'

function getPIDPath () {
  return join(tmpdir(), '.lacona-timer.pid')
}

function appendFile (file, line) {
  return new Promise((resolve, reject) => {
    fs.appendFile(file, `${line}\n`, err => {
      err ? reject(err) : resolve()
    })
  })
}

function setFile (file, content) {
  return new Promise((resolve, reject) => {
    fs.writeFile(file, `${content}\n`, err => {
      err ? reject(err) : resolve()
    })
  })
}

function formatDuration (duration) {
  const entries = ['years', 'months', 'days', 'hours', 'minutes', 'seconds']
  return _.chain(entries)
    .map(entry => [entry, duration.get(entry)])
    .filter(item => item[1])
    .map(item => item[1] > 1 ? `${item[1]} ${item[0]}` : `${item[1]} ${item[0].slice(0, -1)}`)
    .join(', ')
    .value()
}

function readJSONLines (file) {
  return new Promise((resolve, reject) => {
    fs.readFile(file, 'utf8', (err, data) => {
      err
        ? reject(err)
        : resolve(
          _.chain(data)
            .split('\n')
            .filter()
            .map(_.unary(JSON.parse))
            .value()
          )
    })
  })
}

async function startTimer (delay, type, message, stringTime) {
  const pidPath = getPIDPath()
  const out = fs.openSync('/tmp/out.log', 'a');
  const alertFile = join(__dirname, '../bin/alert.sh')
  const notifierFile = join(__dirname, '../bin/MountainNotifier')
  const subtitle = type === 'timer' ? 'Timer' : 'Alarm'
  const content = message || (type === 'timer' ? 'The timer is done' : 'The alarm is going off')
  const proc = spawn(
    '/bin/sh',
    ['-c', `"${alertFile}" "${delay}" "Lacona" "${subtitle}" "${content}" "${pidPath}" "${notifierFile}"`],
    {detached: true, stdio: [out, out, 'ignore']}
  )
  proc.unref()

  const absTime = moment().add(delay, 'seconds').unix()

  const pid = proc.pid
  const newLine = JSON.stringify({
    pid,
    time: absTime,
    type: type,
    message,
    stringTime
  })

  await appendFile(pidPath, newLine)
}

function formatDateTime (datetime) {
  const momDatetime = moment(datetime)
  return momDatetime.diff(moment(), 'days') === 0
    ? momDatetime.format('h:mma')
    : `${momDatetime.format('MMMM D')} at ${momDatetime.format('h:mma')}`
}

export const CreateAlarmCommand = {
  extends: [Command],

  async execute (result) {
    const datetime = moment(result.datetime)
    const delay = datetime.diff(moment(), 'seconds')
    const stringTime = formatDateTime(datetime)
    try {
      await startTimer(delay, 'alarm', result.title, stringTime)
      await showNotification({title: 'Alarm', subtitle: `Set an alarm for ${stringTime}`})
    } catch (e) {
      console.error(e)
      await showNotification({title: 'Timer', subtitle: `An error occurred setting an alarm`})
    }
  },

  describe () {
    return (
      <sequence>
        <list items={['set an alarm ', 'set alarm ', 'create an alarm ', 'create alarm ', 'alarm ']} limit={1} />
        <sequence id='title' optional limited>
          <list items={['called ']} optional preferred limited />
          <String splitOn={/\s/} label='alarm title' merge />
          <literal text=' ' />
        </sequence>
        <sequence id='datetime'>
          <literal text='for ' optional preferred limited />
          <DateTime merge prepositions={false} />
        </sequence>
      </sequence>
    )
  }
}

export const CreateTimerCommand = {
  extends: [Command],

  async execute (result) {
    const duration = moment.duration(result.duration)
    const delay = duration.asSeconds()
    const stringDuration = formatDuration(duration)
    const stringTime = `${stringDuration} started at ${formatDateTime(new Date())}`

    try {
      await startTimer(delay, 'timer', result.title, stringTime)
      await showNotification({title: 'Timer', subtitle: `Started a timer for ${stringDuration}`})
    } catch (e) {
      console.error(e)
      await showNotification({title: 'Timer', subtitle: `An error occurred starting a timer`})
    }
  },

  describe () {
    return (
      <sequence>
        <list items={['set a timer ', 'set timer ', 'create a timer ', 'create timer ', 'timer ']} limit={1} />
        <sequence id='title' optional limited>
          <list items={['called ']} optional preferred limited />
          <String splitOn={/\s/} label='timer title' merge />
          <literal text=' ' />
        </sequence>
        <sequence id='duration'>
          <literal text='for ' optional preferred limited />
          <Duration merge seconds />
        </sequence>
      </sequence>
    )
  }
}

async function getCurrentTimerData () {
  const pidPath = getPIDPath()
  const lines = await readJSONLines(pidPath)

  // for each line, check to see if the timer process still exists

  const trueLines = _.filter(lines, line => isRunning(line.pid))

  if (trueLines.length !== lines.length) {
    const content = _.chain(trueLines)
      .map(_.unary(JSON.stringify))
      .join('\n')
      .value()
    await setFile(pidPath, content)
  }

  const timers = _.filter(trueLines, line => line.type === 'timer')
  const alarms = _.filter(trueLines, line => line.type === 'alarm')

  const timerStrings = _.chain(timers)
    .map(line => {
      return `<li>${line.message || 'Timer'} for ${line.stringTime}</li>`
      // const timeRemaining = moment.unix(line.time).diff(moment(), 'seconds')
      // return `  ${line.message || 'Timer'} in ${timeRemaining} seconds`
    })
    .join('\n')
    .value()

  const alarmStrings = _.chain(alarms)
    .map(line => `<li>${line.message || 'Alarm'} at ${line.stringTime}</li>`)
    .join('\n')
    .value()

  let content = ''
  if (timerStrings) content += `<h3>Timers</h3><ul>${timerStrings}</ul>`
  if (alarmStrings) content += `<h3>Alarms</h3><ul>${alarmStrings}</ul>`

  return content
}

const CurrentTimerDataSource = onActivate(getCurrentTimerData)

export const CheckTimersCommand = {
  extends: [Command],

  preview (result, {observe}) {
    const content = observe(<CurrentTimerDataSource />)
    return {type: 'html', value: content}
  },

  async execute (result, {observe}) {
    const content = observe(<CurrentTimerDataSource />)
    setClipboard({text: content})
  },

  describe () {
    return <list items={['check timers', 'check alarms']} limit={1} />
  }
}

export const extensions = [CreateTimerCommand, CreateAlarmCommand, CheckTimersCommand]
