Delay="$1"
Title="$2"
Subtitle="$3"
Message="$4"
PIDFile="$5"
Notifier="$6"

/bin/sleep "$Delay"

"$Notifier" -sender io.lacona.Lacona -title "$Title" -subtitle "$Subtitle" -message "$Message" -sound default

sed -i.bak '/"pid":'"$$"'/d' "$PIDFile"
