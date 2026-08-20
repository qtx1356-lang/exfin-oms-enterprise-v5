package com.exfin.oms;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.exfin.oms.geofence.GeofencePlugin;
import com.exfin.oms.geofence.OfficeGeofenceHelper;
import com.exfin.oms.location.BackgroundLocationPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GeofencePlugin.class);
        registerPlugin(BackgroundLocationPlugin.class);
        super.onCreate(savedInstanceState);

        // Ensure native office geofence is active
        OfficeGeofenceHelper.registerOfficeGeofence(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Re-verify registration on resume
        OfficeGeofenceHelper.registerOfficeGeofence(this);
    }
}

