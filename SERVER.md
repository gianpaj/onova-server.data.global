# VM Server setup

> The VM is in AWS Lightsail

- account: `760442980053`
- name of instance: nodeserver-1-vm
- hostmame: `onova-gb-frankfurt-2`
- disk: 80GB SSD
- zone: `eu-central-1a` (Frankfurt, Zone A)
- Linux distribution: Ubuntu 16.04.5 LTS (xenial) (VM image from [bitnami](//docs.bitnami.com/aws/infrastructure/nodejs/))
- Node JS 10.x

## Initial setup

```bash
sudo su
apt-get update
apt-get dist-upgrade


l /opt/bitnami/*/scripts/ctl.sh

/opt/bitnami/ctlscript.sh stop redis
/opt/bitnami/ctlscript.sh stop apache
```

## Change hostname

```bash
nano /etc/hosts

# add onova-gb-frankfurt-2
# after 127.0.0.1

hostnamectl set-hostname onova-gb-frankfurt-2
```

## Setup user for CI

```bash
adduser bitbucket
usermod -aG www-data bitbucket
mkdir /var/www
chmod -R g+rwX /var/www
chown -R www-data:www-data /var/www
su - bitbucket
```

Add this to `.bashrc`:

before: `# If not running interactively, don't do anything`

```bash
PATH="/opt/bitnami/redis/bin:/opt/bitnami/python/bin:/opt/bitnami/nodejs/bin:/opt/bitnami/git/bin:/opt/bitnami/apache2/bin:/opt/bitnami/common/bin:$PATH"
export PATH
if [[ -s /opt/bitnami/.bitnamirc ]]; then
  source /opt/bitnami/.bitnamirc
fi
```

```bash
mkdir ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
# paste SSH keys from bitbucket pipelines
chmod 600 ~/.ssh/authorized_keys
exit
```

Test log in with ssh key:

    ssh -i ~/.ssh/bitbucket_onova_id_rsa bitbucket@52.59.136.160

## Generate SSH key to access Bitbucket

```bash
ssh-keygen
cat ~/.ssh/id_rsa.pub
```

Add key to [Bitbucket Project](https://bitbucket.org/account/user/onova/ssh-keys/)

## Firewall

```bash
# apt-get install ufw
ufw allow OpenSSH
ufw allow http
ufw allow https
```

    ufw enable

Check

    ufw status numbered

```
Status: active

     To                         Action      From
     --                         ------      ----
[ 1] OpenSSH                    ALLOW IN    Anywhere
[ 2] 80                         ALLOW IN    Anywhere
[ 3] 443                        ALLOW IN    Anywhere
[ 4] OpenSSH (v6)               ALLOW IN    Anywhere (v6)
[ 5] 80 (v6)                    ALLOW IN    Anywhere (v6)
[ 6] 443 (v6)                   ALLOW IN    Anywhere (v6)
```

<!--
## Node.js v8.x LTS Carbon and npm

```bash
curl -sL https://deb.nodesource.com/setup_8.x -o nodesource_setup.sh
bash nodesource_setup.sh
apt-get install nodejs build-essential

# test
nodejs -v
npm -v
``` -->

## Nginx

```bash
apt-get install nginx -y
# test
systemctl status nginx
curl -4 icanhazip.com
curl http://__server_public_ip_address__
```

Configure default virtual host (for web app):

    nano /etc/nginx/sites-available/default

    server_name onova.co www.onova.co;

Verify syntax of configuration files

    nginx -t

Example:

    nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
    nginx: configuration file /etc/nginx/nginx.conf test is successful

Reload:

    systemctl reload nginx

More settings:

- https://linode.com/docs/web-servers/nginx/tls-deployment-best-practices-for-nginx/
- https://gist.github.com/plentz/6737338
- https://cipherli.st

## SSL Certs

Taken from: [How To Secure Nginx with Let's Encrypt on Ubuntu 16.04 | DigitalOcean](https://www.digitalocean.com/community/tutorials/how-to-secure-nginx-with-let-s-encrypt-on-ubuntu-16-04)

> October 27, 2017

```bash
# apt-get update
# apt-get install software-properties-common
add-apt-repository ppa:certbot/certbot
apt-get update
apt-get install python-certbot-nginx -y
certbot --nginx -d onova.co -d www.onova.co

# Verify Certbot Auto-Renewal
certbot renew --dry-run
```

Check cron job: `/etc/cron.d/certbot`

<!-- ## Swap

Taken from: [How To Add Swap Space on Ubuntu 16.04 | DigitalOcean](https://www.digitalocean.com/community/tutorials/how-to-add-swap-space-on-ubuntu-16-04)

> April 25, 2016

```bash
# test
swapon --show
# test
free -h

fallocate -l 1G /swapfile
chmod 600 /swapfile

mkswap /swapfile
```

Example output:

    Setting up swapspace version 1, size = 1024 MiB (1073737728 bytes)
    no label, UUID=c49fd825-67ef-4978-8f32-d37ecf632192

```bash
swapon /swapfile
# test
swapon --show
```

Example:

    NAME      TYPE  SIZE USED PRIO
    /swapfile file 1024M   0B   -1

```bash
free -h
```

Example:

                  total        used        free      shared  buff/cache   available
    Mem:           3.6G        104M        2.3G        5.3M        1.2G        3.2G
    Swap:          1.0G          0B        1.0G -->

### Adjusting the Swappiness Property

    cat /proc/sys/vm/swappiness
    # 60
    sysctl vm.swappiness=10
    echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf

### Adjusting the Cache Pressure Setting

    cat /proc/sys/vm/vfs_cache_pressure
    # 100
    sysctl vm.vfs_cache_pressure=50
    echo 'vm.vfs_cache_pressure=50' | sudo tee -a /etc/sysctl.conf

## Unattended upgrades

    apt-get install unattended-upgrades

Configure to auto-remove old dependencies:

    nano /etc/apt/apt.conf.d/50unattended-upgrades

with:

    Unattended-Upgrade::Remove-Unused-Dependencies "true";

Set schedule:

    nano /etc/apt/apt.conf.d/20auto-upgrades

with:

    APT::Periodic::Unattended-Upgrade "3";

Configure to automatically upgrade security-only updates:

    nano /etc/apt/apt.conf.d/50unattended-upgrades

Leave only `-security` and `ESM`:

    Unattended-Upgrade::Allowed-Origins {
            "${distro_id}:${distro_codename}-security";
            // Extended Security Maintenance; doesn't necessarily exist for
            // every release and this system may not have it installed, but if
            // available, the policy for updates is such that unattended-upgrades
            // should also install from here by default.
            "${distro_id}ESM:${distro_codename}";
    };

Test:

    unattended-upgrade -v -d --dry-run

Taken from:

- https://gist.github.com/roybotnik/b0ec2eda2bc625e19eaf

## Security

### Fail2ban

<!-- Note: `sshguard` should be already installed -->

```bash
apt-get install fail2ban
cp /etc/fail2ban/fail2ban.conf /etc/fail2ban/fail2ban.local
cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
# edit the maxretry to 3
nano /etc/fail2ban/jail.local
systemctl restart fail2ban

# test
fail2ban-client status
fail2ban-client status sshd
```

## Misc

    apt-get install git

### UTC timezone and NTC sync

```bash
date
timedatectl
timedatectl set-timezone UTC

# test
date

timedatectl
```

Example:

          Local time: Wed 2018-04-04 11:12:10 UTC
      Universal time: Wed 2018-04-04 11:12:10 UTC
            RTC time: Wed 2018-04-04 11:12:10
           Time zone: UTC (UTC, +0000)
     Network time on: yes
    NTP synchronized: yes
     RTC in local TZ: no

## Node.js App

    curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
    sudo apt-get install -y nodejs

    npm install npm -g
    npm install pm2 -g

To ensure that your Node.js applications start automatically when the server boots up:

```bash
sudo su - bitbucket

# rotate logs (by default everyday at midnight)
pm2 install pm2-logrotate
# retail 30 logs for 30 days (based on rotateInterval)
pm2 set pm2-logrotate:retain 30

pm2 startup systemd
exit
sudo env PATH=$PATH:/opt/bitnami/nodejs/bin /opt/bitnami/nodejs/lib/node_modules/pm2/bin/pm2 startup systemd -u bitbucket --hp /home/bitbucket

sudo su - bitbucket
pm2 save
```

### Install yarn

    curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
    echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
    apt-get update
    apt-get install yarn -y

### Set Up Nginx as a Reverse Proxy Server

TODO: [how-to-set-up-a-node-js-application-for-production-on-ubuntu-16-04#set-up-nginx-as-a-reverse-proxy-server](https://www.digitalocean.com/community/tutorials/how-to-set-up-a-node-js-application-for-production-on-ubuntu-16-04#set-up-nginx-as-a-reverse-proxy-server)

## Install MongoDB

> If running secondary on the same machine. Otherwise use Bitnami's [image](https://google.bitnami.com/launch/mongodb) ([docs](https://docs.bitnami.com/google/infrastructure/mongodb/))
> but use SSD persistent disk

Follow: [Install MongoDB Community Edition¶](https://docs.mongodb.com/manual/tutorial/install-mongodb-on-ubuntu/#install-mongodb-community-edition)

```bash
sudo su
nano /opt/bitnami/mongodb/mongodb.conf

# enable service (autostart)
sudo systemctl enable mongod

apt-get install ufw
ufw allow OpenSSH
ufw allow from 10.156.0.2/24 to any port 28025
ufw enable
ufw status numbered
```

## Start PM2 apps

```bash
cd /var/www
ln -s server.data/ecosystem.yml .
pm2 start ecosystem.yml
```
