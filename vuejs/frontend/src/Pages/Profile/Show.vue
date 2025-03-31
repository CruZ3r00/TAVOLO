<script setup>
import { ref } from 'vue';
import DeleteUserForm from '@/Pages/Profile/Partials/DeleteUserForm.vue';
import SectionBorder from '@/components/SectionBorder.vue';
import TwoFactorAuthenticationForm from '@/Pages/Profile/Partials/TwoFactorAuthenticationForm.vue';
import UpdatePasswordForm from '@/Pages/Profile/Partials/UpdatePasswordForm.vue';
import UpdateProfileInformationForm from '@/Pages/Profile/Partials/UpdateProfileInformationForm.vue';
import AppLayout from '@/Layouts/AppLayout.vue';
import Footer from '@/components/Footer.vue';
import { useStore } from 'vuex';
const store = useStore();


defineProps({
    confirmsTwoFactorAuthentication: Boolean,
    sessions: Array,
});
const userinfo = ref('');
const x = store.getters.getUser;
userinfo.value = {
    'id': x.id,
    'username' :  x.username,
    'email' : x.email,
}
</script>

<template>
   

    <AppLayout>

        <section class=" py-5"> 
            
            <div class="bg-white position-relative">
                <div>
                    <UpdateProfileInformationForm :user="userinfo" />
                    <SectionBorder />

                    <UpdatePasswordForm :id="userinfo.id"/>
                    <SectionBorder />
                
                    <TwoFactorAuthenticationForm :requires-confirmation="confirmsTwoFactorAuthentication"/>
                    <SectionBorder />


                    <template>
                        <SectionBorder />

                        <DeleteUserForm />
                    </template>
                </div>
            </div>
        </section>
    </AppLayout>
</template>
