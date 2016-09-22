Delay="$1"
Title="$2"
Subtitle="$3"
Message="$4"
PIDFile="$5"
Notifier="$6"

/bin/sleep "$Delay"

"$Notifier" io.lacona.Lacona "$Title" "$Subtitle" "$Message"

sed -i.bak '/"pid":'"$$"'/d' "$PIDFile"