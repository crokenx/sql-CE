let mkdirp = require('mkdirp')
let moment = require('moment')
let log = require('@ci24/ci-logmodule')
let settings = require('./settings.json')
let fs = require('fs')
let path = require('path')
let childproc = require('child_process')
let request = require('request')

let main = () => {
    log.write('Initializing main function')

    log.write('VideoBaseFolder: ' + settings.BackupBaseFolder)
    let fileName = "backup-" + moment().format('YYYYMMDDHHmmss') + '.bak';

    let continueProc = false
    let errMsg = ''
    try {
        if (fs.existsSync(settings.BackupBaseFolder) == false) {
            mkdirp.sync(settings.BackupBaseFolder)
        }
        continueProc = true
    }
    catch(e) {
        log.error('Error creando carpeta - verificar: ' + e.stack)
        errMsg = e.stack
    }
    
    if (continueProc == false) {
        let subject = `[ERROR] Backup no generado ${fileName} Punto ${settings.EndPointName}`
        let message = `No se pudo crear la carpeta: ${settings.BackupBaseFolder}. Verificar si la unidad existe o si tiene permisos: ` + errMsg

        SendAlertMail(subject, message)
    }
    else {
        GenerateBackup(fileName);
    }
}

function GenerateBackup(fileName) {
    log.write('Generating backup using sqlcmd')
    
    let sqlCmdPath = '"C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\130\\Tools\\Binn\\SQLCMD.EXE"'
    let fullFileName = path.join(settings.BackupBaseFolder, fileName)

    let cmd = `${sqlCmdPath} -S ${settings.ServerName} -U ${settings.UserName} -P ${settings.Password} -Q "BACKUP DATABASE ${settings.DatabaseName} TO DISK = N'${fullFileName}'"`

    log.write('Execute command ' + cmd)

    childproc.exec(cmd, (err, stdout, stderr)=> {
        if (err != null || (stdout.indexOf('successfully') < 0 && stdout.indexOf('correctamente') < 0)) {
            log.error('Error generating backup ' + stdout)

            let subject = `[ERROR] Backup no generado ${fileName} Punto ${settings.EndPointName}`
            let message = `Mensaje stdout: ${stdout} stderr: ${stderr}`

            SendAlertMail(subject, message)
        }
        else {
            log.write('Checking old files')
        
            let files = fs.readdirSync(settings.BackupBaseFolder);
            console.log('Files: ' + JSON.stringify(files))

            files.sort(function(a, b) {
                       return fs.statSync(path.join(settings.BackupBaseFolder, a)).mtime.getTime() - 
                              fs.statSync(path.join(settings.BackupBaseFolder, b)).mtime.getTime();
                   });
        
            while (files.length > settings.NumFilesToKeep) {
                console.log('Deleting file ' + files[0])
                fs.unlinkSync(path.join(settings.BackupBaseFolder, files[0]))
                files.splice(0, 1)
            }
        
            let subject = `[INFO] Backup generado ${fileName} Punto ${settings.EndPointName}`
            let message = `Backup generado exitosamente`

            compresion(settings.BackupBaseFolder, '/' + fileName, settings.BackupBaseFolder);
            
            log.write('Done!')
            SendAlertMail(subject, message)
        }
    })
}

function SendAlertMail (subject, message) {
    log.write(`Sending alert mail subject ${subject} message ${message}`)
    
    let objToSend = {
        addresses: settings.NotificationServiceMails,
        title: subject,
        message: message,
    }

    let url = `http://${settings.NotificationServiceHost}:5005/SendMailController`
    log.write(url)
    
    request.post(url, {
        json: true,
        body: objToSend,
        timeout: 15 * 1000
    }, (err, res)=> {
        if (err) {
            log.error("Error sending notification")
        }
        else if (res.statusCode != 200) {
            log.error("Error sending notification: Status code invalido: " + res.statusCode)
        }
        else {
            log.write("Notification sended")
        }
    })
}

function compresion (acceso, backup, repositorio){
    var archiver = require('archiver');

    var output = fs.createWriteStream(repositorio + '/' + backup + '.zip');
    var archive = archiver('zip', {
    zlib: { level: 7 }
    });

    archive.pipe(output);

    var archivo = acceso + backup;
    archive.append(fs.createReadStream(archivo), { name: backup });
        
    const path = acceso + backup;
    try {
        fs.unlinkSync(path)
        //file removed
        } catch(err) {
        console.error(err)
        }

    archive.finalize();   
}

main()
